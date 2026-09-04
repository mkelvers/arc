import { and, desc, eq, isNull, lte, ne, or } from 'drizzle-orm';

import {
    intervalFromTemplate,
    type EpisodeSkipTimes,
    type SegmentTemplates,
    type SkipInterval,
    type SkipKind,
} from '@arc/core/player/skip-times';
import { db } from '@arc/shared/db';
import { animeEpisode, animeEpisodeSegmentTemplate } from '@arc/shared/db/schema';
import { fetchAniSkip, validSkipInterval } from './aniskip';

const aniskipFailureUntil = new Map<string, number>();

type StoredSkipTimes = Pick<
    typeof animeEpisode.$inferSelect,
    | 'openingStartSeconds'
    | 'openingEndSeconds'
    | 'endingStartSeconds'
    | 'endingEndSeconds'
    | 'skipTimesSource'
    | 'skipTimesFetchedAt'
>;

function storedTimes(row: StoredSkipTimes): EpisodeSkipTimes {
    const source =
        row.skipTimesSource === 'aniskip' || row.skipTimesSource === 'manual'
            ? row.skipTimesSource
            : null;

    return {
        opening:
            row.openingStartSeconds !== null && row.openingEndSeconds !== null
                ? {
                      start: row.openingStartSeconds,
                      end: row.openingEndSeconds,
                  }
                : null,
        ending:
            row.endingStartSeconds !== null && row.endingEndSeconds !== null
                ? {
                      start: row.endingStartSeconds,
                      end: row.endingEndSeconds,
                  }
                : null,
        source,
    };
}

interface EpisodeIdentity {
    anilistId: number;
    episodeId: string;
    episodeNumber: number;
    malId: number | null | undefined;
}

async function storedEpisodeTimes(anilistId: number, episodeId: string) {
    return db
        .select({
            openingStartSeconds: animeEpisode.openingStartSeconds,
            openingEndSeconds: animeEpisode.openingEndSeconds,
            endingStartSeconds: animeEpisode.endingStartSeconds,
            endingEndSeconds: animeEpisode.endingEndSeconds,
            skipTimesSource: animeEpisode.skipTimesSource,
            skipTimesFetchedAt: animeEpisode.skipTimesFetchedAt,
        })
        .from(animeEpisode)
        .where(and(eq(animeEpisode.anilistId, anilistId), eq(animeEpisode.episodeId, episodeId)))
        .limit(1)
        .then((rows) => rows[0]);
}

export async function getEpisodeSkipTimes({
    anilistId,
    episodeId,
    episodeNumber,
    malId,
}: EpisodeIdentity): Promise<EpisodeSkipTimes> {
    const row = await storedEpisodeTimes(anilistId, episodeId);

    if (!row) {
        return { opening: null, ending: null, source: null };
    }

    const stored = storedTimes(row);
    const fresh =
        row.skipTimesFetchedAt &&
        Date.now() - row.skipTimesFetchedAt.getTime() < 30 * 24 * 60 * 60 * 1_000;
    if (row.skipTimesSource === 'manual' || fresh) {
        return stored;
    }

    if (
        !malId ||
        !Number.isSafeInteger(malId) ||
        !Number.isSafeInteger(episodeNumber) ||
        episodeNumber <= 0
    ) {
        return stored;
    }

    const failureKey = `${malId}:${episodeNumber}`;
    if ((aniskipFailureUntil.get(failureKey) ?? 0) > Date.now()) {
        return stored;
    }

    try {
        const remote = await fetchAniSkip(malId, episodeNumber);
        aniskipFailureUntil.delete(failureKey);
        const [updated] = await db
            .update(animeEpisode)
            .set({
                openingStartSeconds: remote.opening?.start ?? null,
                openingEndSeconds: remote.opening?.end ?? null,
                endingStartSeconds: remote.ending?.start ?? null,
                endingEndSeconds: remote.ending?.end ?? null,
                skipTimesSource: 'aniskip',
                skipTimesFetchedAt: new Date(),
            })
            .where(
                and(
                    eq(animeEpisode.anilistId, anilistId),
                    eq(animeEpisode.episodeId, episodeId),
                    or(
                        isNull(animeEpisode.skipTimesSource),
                        ne(animeEpisode.skipTimesSource, 'manual')
                    )
                )
            )
            .returning({ episodeId: animeEpisode.episodeId });

        return updated ? remote : getStoredEpisodeSkipTimes(anilistId, episodeId);
    } catch {
        aniskipFailureUntil.set(failureKey, Date.now() + 5 * 60 * 1_000);
        return stored;
    }
}

async function getStoredEpisodeSkipTimes(
    anilistId: number,
    episodeId: string
): Promise<EpisodeSkipTimes> {
    const row = await storedEpisodeTimes(anilistId, episodeId);

    return row ? storedTimes(row) : { opening: null, ending: null, source: null };
}

export async function getSegmentTemplates(
    anilistId: number,
    episodeNumber: number
): Promise<SegmentTemplates> {
    const templates: SegmentTemplates = { opening: null, ending: null };
    if (!Number.isSafeInteger(episodeNumber) || episodeNumber <= 0) {
        return templates;
    }

    const rows = await db
        .select({
            kind: animeEpisodeSegmentTemplate.kind,
            fromEpisode: animeEpisodeSegmentTemplate.episodeFrom,
            duration: animeEpisodeSegmentTemplate.durationSeconds,
        })
        .from(animeEpisodeSegmentTemplate)
        .where(
            and(
                eq(animeEpisodeSegmentTemplate.anilistId, anilistId),
                lte(animeEpisodeSegmentTemplate.episodeFrom, episodeNumber)
            )
        )
        .orderBy(desc(animeEpisodeSegmentTemplate.episodeFrom));

    for (const row of rows) {
        if (!templates[row.kind] && intervalFromTemplate(0, row.duration)) {
            templates[row.kind] = {
                fromEpisode: row.fromEpisode,
                duration: row.duration,
            };
        }
    }

    return templates;
}

type SegmentSave = {
    anilistId: number;
    episodeId: string;
    kind: SkipKind;
} & (
    | { operation: 'clear' }
    | { operation: 'apply-template'; start: number }
    | { operation: 'set'; interval: SkipInterval; createTemplate: boolean }
);

export async function saveEpisodeSegment(save: SegmentSave) {
    const saved = await db.transaction(async (tx) => {
        const [episode] = await tx
            .select({ number: animeEpisode.number })
            .from(animeEpisode)
            .where(
                and(
                    eq(animeEpisode.anilistId, save.anilistId),
                    eq(animeEpisode.episodeId, save.episodeId)
                )
            )
            .limit(1);
        if (!episode) {
            return null;
        }
        if (
            (save.operation === 'apply-template' ||
                (save.operation === 'set' && save.createTemplate)) &&
            (!Number.isSafeInteger(episode.number) || episode.number <= 0)
        ) {
            return null;
        }

        let interval: SkipInterval | null;
        if (save.operation === 'clear') {
            interval = null;
        } else if (save.operation === 'set') {
            interval = save.interval;
        } else {
            const [template] = await tx
                .select({ duration: animeEpisodeSegmentTemplate.durationSeconds })
                .from(animeEpisodeSegmentTemplate)
                .where(
                    and(
                        eq(animeEpisodeSegmentTemplate.anilistId, save.anilistId),
                        eq(animeEpisodeSegmentTemplate.kind, save.kind),
                        lte(animeEpisodeSegmentTemplate.episodeFrom, episode.number)
                    )
                )
                .orderBy(desc(animeEpisodeSegmentTemplate.episodeFrom))
                .limit(1);
            interval = template ? intervalFromTemplate(save.start, template.duration) : null;
            if (!interval || !validSkipInterval(interval)) {
                return null;
            }
        }

        const values =
            save.kind === 'opening'
                ? {
                      openingStartSeconds: interval?.start ?? null,
                      openingEndSeconds: interval?.end ?? null,
                      skipTimesSource: 'manual' as const,
                      skipTimesFetchedAt: new Date(),
                  }
                : {
                      endingStartSeconds: interval?.start ?? null,
                      endingEndSeconds: interval?.end ?? null,
                      skipTimesSource: 'manual' as const,
                      skipTimesFetchedAt: new Date(),
                  };
        await tx
            .update(animeEpisode)
            .set(values)
            .where(
                and(
                    eq(animeEpisode.anilistId, save.anilistId),
                    eq(animeEpisode.episodeId, save.episodeId)
                )
            );

        if (save.operation === 'set' && save.createTemplate) {
            await tx
                .insert(animeEpisodeSegmentTemplate)
                .values({
                    anilistId: save.anilistId,
                    kind: save.kind,
                    episodeFrom: episode.number,
                    durationSeconds: save.interval.end - save.interval.start,
                })
                .onConflictDoUpdate({
                    target: [
                        animeEpisodeSegmentTemplate.anilistId,
                        animeEpisodeSegmentTemplate.kind,
                        animeEpisodeSegmentTemplate.episodeFrom,
                    ],
                    set: {
                        durationSeconds: save.interval.end - save.interval.start,
                    },
                });
        }

        return episode.number;
    });
    if (saved === null) {
        return null;
    }

    const [times, templates] = await Promise.all([
        getStoredEpisodeSkipTimes(save.anilistId, save.episodeId),
        getSegmentTemplates(save.anilistId, saved),
    ]);

    return { times, templates };
}
