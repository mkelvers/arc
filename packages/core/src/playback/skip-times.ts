import { and, desc, eq, isNull, lte, ne, or } from 'drizzle-orm';

import {
    intervalFromTemplate,
    type EpisodeSkipTimes,
    type SegmentTemplates,
    type SkipInterval,
    type SkipKind,
} from '../player/skip-times';
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
    | 'openingSkipTimesSource'
    | 'endingSkipTimesSource'
    | 'openingSkipTimesFetchedAt'
    | 'endingSkipTimesFetchedAt'
    | 'skipTimesSource'
    | 'skipTimesFetchedAt'
>;

function skipTimesSource(value: string | null) {
    return value === 'anikoto' || value === 'aniskip' || value === 'manual' ? value : null;
}

function storedTimes(row: StoredSkipTimes): EpisodeSkipTimes {
    const legacySource = skipTimesSource(row.skipTimesSource);
    const opening =
        row.openingStartSeconds !== null && row.openingEndSeconds !== null
            ? {
                  start: row.openingStartSeconds,
                  end: row.openingEndSeconds,
              }
            : null;
    const ending =
        row.endingStartSeconds !== null && row.endingEndSeconds !== null
            ? {
                  start: row.endingStartSeconds,
                  end: row.endingEndSeconds,
              }
            : null;

    return {
        opening,
        ending,
        sources: {
            // Older rows only have one source column. Apply it to a segment
            // that actually exists; an absent ending must remain discoverable.
            opening: skipTimesSource(row.openingSkipTimesSource) ?? (opening ? legacySource : null),
            ending: skipTimesSource(row.endingSkipTimesSource) ?? (ending ? legacySource : null),
        },
    };
}

function automaticSegmentWriteCondition(kind: SkipKind) {
    const source =
        kind === 'opening'
            ? animeEpisode.openingSkipTimesSource
            : animeEpisode.endingSkipTimesSource;
    const start =
        kind === 'opening' ? animeEpisode.openingStartSeconds : animeEpisode.endingStartSeconds;
    const end = kind === 'opening' ? animeEpisode.openingEndSeconds : animeEpisode.endingEndSeconds;

    return or(
        ne(source, 'manual'),
        and(
            isNull(source),
            or(
                isNull(start),
                isNull(end),
                or(isNull(animeEpisode.skipTimesSource), ne(animeEpisode.skipTimesSource, 'manual'))
            )
        )
    );
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
            openingSkipTimesSource: animeEpisode.openingSkipTimesSource,
            endingSkipTimesSource: animeEpisode.endingSkipTimesSource,
            openingSkipTimesFetchedAt: animeEpisode.openingSkipTimesFetchedAt,
            endingSkipTimesFetchedAt: animeEpisode.endingSkipTimesFetchedAt,
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
        return {
            opening: null,
            ending: null,
            sources: { opening: null, ending: null },
        };
    }

    const stored = storedTimes(row);
    const fresh = (fetchedAt: Date | null) =>
        fetchedAt !== null && Date.now() - fetchedAt.getTime() < 30 * 24 * 60 * 60 * 1_000;
    const openingNeedsRefresh =
        stored.sources.opening !== 'manual' &&
        !fresh(row.openingSkipTimesFetchedAt ?? (stored.opening ? row.skipTimesFetchedAt : null));
    const endingNeedsRefresh =
        stored.sources.ending !== 'manual' &&
        !fresh(row.endingSkipTimesFetchedAt ?? (stored.ending ? row.skipTimesFetchedAt : null));
    if (!openingNeedsRefresh && !endingNeedsRefresh) {
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
        const fetchedAt = new Date();
        await db.transaction(async (tx) => {
            if (openingNeedsRefresh) {
                await tx
                    .update(animeEpisode)
                    .set({
                        openingStartSeconds: remote.opening?.start ?? null,
                        openingEndSeconds: remote.opening?.end ?? null,
                        openingSkipTimesSource: 'aniskip',
                        openingSkipTimesFetchedAt: fetchedAt,
                    })
                    .where(
                        and(
                            eq(animeEpisode.anilistId, anilistId),
                            eq(animeEpisode.episodeId, episodeId),
                            automaticSegmentWriteCondition('opening')
                        )
                    );
            }
            if (endingNeedsRefresh) {
                await tx
                    .update(animeEpisode)
                    .set({
                        endingStartSeconds: remote.ending?.start ?? null,
                        endingEndSeconds: remote.ending?.end ?? null,
                        endingSkipTimesSource: 'aniskip',
                        endingSkipTimesFetchedAt: fetchedAt,
                    })
                    .where(
                        and(
                            eq(animeEpisode.anilistId, anilistId),
                            eq(animeEpisode.episodeId, episodeId),
                            automaticSegmentWriteCondition('ending')
                        )
                    );
            }
        });

        return getStoredEpisodeSkipTimes(anilistId, episodeId);
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

    return row
        ? storedTimes(row)
        : {
              opening: null,
              ending: null,
              sources: { opening: null, ending: null },
          };
}

export async function saveAniKotoSkipTimes({
    anilistId,
    episodeId,
    times,
}: {
    anilistId: number;
    episodeId: string;
    times: EpisodeSkipTimes;
}) {
    if (times.sources.opening !== 'anikoto' && times.sources.ending !== 'anikoto') {
        return false;
    }

    const fetchedAt = new Date();
    let updated = false;
    await db.transaction(async (tx) => {
        if (times.sources.opening === 'anikoto') {
            const [result] = await tx
                .update(animeEpisode)
                .set({
                    openingStartSeconds: times.opening?.start ?? null,
                    openingEndSeconds: times.opening?.end ?? null,
                    openingSkipTimesSource: 'anikoto',
                    openingSkipTimesFetchedAt: fetchedAt,
                })
                .where(
                    and(
                        eq(animeEpisode.anilistId, anilistId),
                        eq(animeEpisode.episodeId, episodeId),
                        automaticSegmentWriteCondition('opening')
                    )
                )
                .returning({ episodeId: animeEpisode.episodeId });
            updated ||= Boolean(result);
        }
        if (times.sources.ending === 'anikoto') {
            const [result] = await tx
                .update(animeEpisode)
                .set({
                    endingStartSeconds: times.ending?.start ?? null,
                    endingEndSeconds: times.ending?.end ?? null,
                    endingSkipTimesSource: 'anikoto',
                    endingSkipTimesFetchedAt: fetchedAt,
                })
                .where(
                    and(
                        eq(animeEpisode.anilistId, anilistId),
                        eq(animeEpisode.episodeId, episodeId),
                        automaticSegmentWriteCondition('ending')
                    )
                )
                .returning({ episodeId: animeEpisode.episodeId });
            updated ||= Boolean(result);
        }
    });

    return updated;
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
                      openingSkipTimesSource: 'manual' as const,
                      openingSkipTimesFetchedAt: new Date(),
                      skipTimesSource: 'manual' as const,
                      skipTimesFetchedAt: new Date(),
                  }
                : {
                      endingStartSeconds: interval?.start ?? null,
                      endingEndSeconds: interval?.end ?? null,
                      endingSkipTimesSource: 'manual' as const,
                      endingSkipTimesFetchedAt: new Date(),
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
