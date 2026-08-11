import type { Queue } from 'bullmq';
import { z } from 'zod';

import { workerConfig } from '../config';

const jobOptions = {
    priority: 1,
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 60_000 },
    removeOnComplete: true,
    removeOnFail: true,
};
const scanResultSchema = z.array(
    z.object({
        id: z.number().int().positive(),
        airingAt: z.number().int().positive().nullable(),
        episode: z.number().int().positive().nullable(),
        refreshNow: z.boolean(),
        refreshEpisode: z.number().int().positive().nullable(),
    })
);
const syncResultSchema = z.object({
    episodeAvailable: z.boolean(),
    mediaStatus: z.string().nullable(),
    nextAiringAt: z.number().int().positive().nullable().optional(),
    nextAiringEpisode: z.number().int().positive().nullable().optional(),
});

function addEpisodeSync(
    queue: Queue,
    anilistId: number,
    targetEpisode: number | null,
    delay: number
) {
    const target = targetEpisode ?? 'inventory';

    return queue.add(
        'sync-airing',
        {
            anilistId,
            ...(targetEpisode === null ? {} : { targetEpisode }),
        },
        {
            ...jobOptions,
            jobId: `airing-${anilistId}-${target}`,
            delay,
        }
    );
}

export async function scanAiring(queue: Queue) {
    const startedAt = Date.now();
    console.log('Airing anime scan started');

    const response = await fetch(`${workerConfig.webUrl}/api/internal/sync/airing`, {
        headers: { Authorization: `Bearer ${workerConfig.workerToken}` },
        signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
        throw new Error(`Could not scan airing anime: ${response.status}`);
    }

    const anime = scanResultSchema.parse(await response.json());
    console.log(`Airing anime scan found ${anime.length} anime`);

    for (const item of anime) {
        if (item.refreshNow) {
            await addEpisodeSync(queue, item.id, item.refreshEpisode, 0);
        }

        if (item.airingAt && item.episode) {
            await addEpisodeSync(
                queue,
                item.id,
                item.episode,
                Math.max(0, item.airingAt * 1_000 + 10 * 60 * 1_000 - Date.now())
            );
        }
    }

    console.log(`Airing anime scan completed in ${Date.now() - startedAt}ms`);
}

export async function syncAiring(anilistId: number, targetEpisode?: number) {
    console.log(
        `Airing episode sync started for AniList ${anilistId}${targetEpisode ? ` episode ${targetEpisode}` : ''}`
    );

    const response = await fetch(`${workerConfig.webUrl}/api/internal/sync/airing`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${workerConfig.workerToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            anilistId,
            ...(targetEpisode ? { targetEpisode } : {}),
        }),
        signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
        throw new Error(
            `Airing episode sync failed for AniList ${anilistId}${targetEpisode ? ` episode ${targetEpisode}` : ''}: ${response.status}`
        );
    }

    const result = syncResultSchema.parse(await response.json());
    console.log(
        result.episodeAvailable
            ? `Airing episode sync completed for AniList ${anilistId}`
            : targetEpisode
              ? `AniList ${anilistId} episode ${targetEpisode} is not available from playback providers yet`
              : `AniList ${anilistId} has no playback provider inventory yet`
    );

    return result;
}
