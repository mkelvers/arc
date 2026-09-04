import { AiringAnimePageDocument } from '@arc/shared/anilist/generated/graphql';
import { batches } from '#utils';
import { request } from './client';
import { parseAiringMedia, type AiringAnime, type AiringPageEntry } from '@arc/core/catalog/airing';

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
                { refreshAfterMs: 60 * 60 * 1_000, forceRefresh }
            );

            for (const media of response.Page?.media ?? []) {
                if (!media) {
                    continue;
                }

                anime.push(parseAiringMedia(media, now));
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

export async function discoverAiringAnime(now = new Date()) {
    return releaseSchedules(await getAiringPages(undefined, now, true, 1, true));
}
