import { AiringAnimePageDocument } from '@arc/shared/anilist/generated/graphql';
import { z } from 'zod';
import { batches } from '#utils';
import { request } from './client';

const airingMediaSchema = z.object({
    id: z.number().int().positive(),
    nextAiringEpisode: z
        .object({
            airingAt: z.number().int().positive(),
            episode: z.number().int().positive(),
        })
        .nullable(),
    airingSchedule: z
        .object({
            pageInfo: z.object({ lastPage: z.number().int().positive().nullable() }).nullable(),
            nodes: z
                .array(
                    z
                        .object({
                            airingAt: z.number().int().positive(),
                            episode: z.number().int().positive(),
                        })
                        .nullable()
                )
                .nullable(),
        })
        .nullable(),
});

export interface AiringAnime {
    id: number;
    nextAiringAt: number | null;
    nextAiringEpisode: number | null;
    latestAiredAt: number | null;
    latestAiredEpisode: number | null;
}

type AiringPageEntry = AiringAnime & { scheduleLastPage: number };

async function getAiringPages(
    ids: number[] | undefined,
    now: Date,
    forceRefresh: boolean,
    schedulePage = 1,
    expandLongSchedules = false
) {
    const anime: AiringPageEntry[] = [];

    if (ids?.length === 0) {
        return anime;
    }

    const idBatches = ids ? batches(ids, 250) : [undefined];
    for (const batch of idBatches) {
        for (let page = 1; ; page += 1) {
            const response = await request(
                AiringAnimePageDocument,
                { page, perPage: 50, ids: batch, schedulePage },
                { cacheForMs: 60 * 60 * 1_000, forceRefresh }
            );

            for (const media of response.Page?.media ?? []) {
                if (!media) {
                    continue;
                }

                const parsed = airingMediaSchema.safeParse(media);
                if (!parsed.success) {
                    throw new Error('AniList returned invalid airing discovery data', {
                        cause: parsed.error,
                    });
                }

                const latest = (parsed.data.airingSchedule?.nodes ?? [])
                    .filter(
                        (entry): entry is NonNullable<typeof entry> =>
                            entry !== null && entry.airingAt * 1_000 <= now.getTime()
                    )
                    .sort((left, right) => right.airingAt - left.airingAt)[0];

                anime.push({
                    id: parsed.data.id,
                    nextAiringAt: parsed.data.nextAiringEpisode?.airingAt ?? null,
                    nextAiringEpisode: parsed.data.nextAiringEpisode?.episode ?? null,
                    latestAiredAt: latest?.airingAt ?? null,
                    latestAiredEpisode: latest?.episode ?? null,
                    scheduleLastPage: parsed.data.airingSchedule?.pageInfo?.lastPage ?? 1,
                });
            }

            if (!response.Page?.pageInfo?.hasNextPage) {
                break;
            }
        }
    }

    if (expandLongSchedules) {
        for (const release of anime) {
            const latestAiredPage = release.nextAiringEpisode
                ? Math.ceil((release.nextAiringEpisode - 1) / 50)
                : release.scheduleLastPage;
            if (latestAiredPage <= 1) {
                continue;
            }
            const [schedulePage] = await getAiringPages(
                [release.id],
                now,
                forceRefresh,
                latestAiredPage
            );
            if (schedulePage?.latestAiredAt) {
                release.latestAiredAt = schedulePage.latestAiredAt;
                release.latestAiredEpisode = schedulePage.latestAiredEpisode;
            }
        }
    }

    return anime;
}

function releaseSchedules(entries: AiringPageEntry[]): AiringAnime[] {
    return entries.map((entry) => ({
        id: entry.id,
        nextAiringAt: entry.nextAiringAt,
        nextAiringEpisode: entry.nextAiringEpisode,
        latestAiredAt: entry.latestAiredAt,
        latestAiredEpisode: entry.latestAiredEpisode,
    }));
}

export async function getAiringAnime(ids: number[], now = new Date()) {
    return releaseSchedules(await getAiringPages(ids, now, false));
}

export async function discoverAiringAnime(now = new Date()) {
    return releaseSchedules(await getAiringPages(undefined, now, true, 1, true));
}
