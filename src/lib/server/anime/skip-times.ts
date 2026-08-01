import { and, eq, isNull, ne, or } from 'drizzle-orm';

import type { EpisodeSkipTimes } from '$lib/player/skip-times';
import { db } from '$lib/server/db';
import { animeEpisode } from '$lib/server/db/schema';
import { fetchAniSkip } from './aniskip';

const refreshAfterMs = 30 * 24 * 60 * 60 * 1_000;

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
            row.openingStartSeconds !== null &&
            row.openingEndSeconds !== null
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

export async function getEpisodeSkipTimes({
    anilistId,
    episodeId,
    episodeNumber,
    malId,
}: EpisodeIdentity): Promise<EpisodeSkipTimes> {
    const [row] = await db
        .select({
            openingStartSeconds: animeEpisode.openingStartSeconds,
            openingEndSeconds: animeEpisode.openingEndSeconds,
            endingStartSeconds: animeEpisode.endingStartSeconds,
            endingEndSeconds: animeEpisode.endingEndSeconds,
            skipTimesSource: animeEpisode.skipTimesSource,
            skipTimesFetchedAt: animeEpisode.skipTimesFetchedAt,
        })
        .from(animeEpisode)
        .where(
            and(
                eq(animeEpisode.anilistId, anilistId),
                eq(animeEpisode.episodeId, episodeId),
            ),
        )
        .limit(1);

    if (!row) {
        return { opening: null, ending: null, source: null };
    }

    const cached = storedTimes(row);
    const fresh =
        row.skipTimesFetchedAt &&
        Date.now() - row.skipTimesFetchedAt.getTime() < refreshAfterMs;
    if (row.skipTimesSource === 'manual' || fresh) {
        return cached;
    }

    if (
        !malId ||
        !Number.isSafeInteger(malId) ||
        !Number.isSafeInteger(episodeNumber) ||
        episodeNumber <= 0
    ) {
        return cached;
    }

    try {
        const remote = await fetchAniSkip(malId, episodeNumber);
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
                        ne(animeEpisode.skipTimesSource, 'manual'),
                    ),
                ),
            )
            .returning({ episodeId: animeEpisode.episodeId });

        return updated
            ? remote
            : getStoredEpisodeSkipTimes(anilistId, episodeId);
    } catch (cause) {
        const detail =
            cause instanceof Error ? cause.message : 'Unknown AniSkip failure';
        console.warn(
            `AniSkip unavailable for AniList ${anilistId}, episode ${episodeId}: ${detail}`,
        );
        return cached;
    }
}

export async function getStoredEpisodeSkipTimes(
    anilistId: number,
    episodeId: string,
): Promise<EpisodeSkipTimes> {
    const [row] = await db
        .select({
            openingStartSeconds: animeEpisode.openingStartSeconds,
            openingEndSeconds: animeEpisode.openingEndSeconds,
            endingStartSeconds: animeEpisode.endingStartSeconds,
            endingEndSeconds: animeEpisode.endingEndSeconds,
            skipTimesSource: animeEpisode.skipTimesSource,
            skipTimesFetchedAt: animeEpisode.skipTimesFetchedAt,
        })
        .from(animeEpisode)
        .where(
            and(
                eq(animeEpisode.anilistId, anilistId),
                eq(animeEpisode.episodeId, episodeId),
            ),
        )
        .limit(1);

    return row
        ? storedTimes(row)
        : { opening: null, ending: null, source: null };
}

export async function saveEpisodeSkipTimes(
    anilistId: number,
    episodeId: string,
    times: Pick<EpisodeSkipTimes, 'opening' | 'ending'>,
) {
    const [row] = await db
        .update(animeEpisode)
        .set({
            openingStartSeconds: times.opening?.start ?? null,
            openingEndSeconds: times.opening?.end ?? null,
            endingStartSeconds: times.ending?.start ?? null,
            endingEndSeconds: times.ending?.end ?? null,
            skipTimesSource: 'manual',
            skipTimesFetchedAt: new Date(),
        })
        .where(
            and(
                eq(animeEpisode.anilistId, anilistId),
                eq(animeEpisode.episodeId, episodeId),
            ),
        )
        .returning({ episodeId: animeEpisode.episodeId });

    return row
        ? ({ ...times, source: 'manual' } satisfies EpisodeSkipTimes)
        : null;
}
