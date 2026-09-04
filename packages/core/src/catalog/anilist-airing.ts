import { AiringAnimePageDocument } from '@arc/shared/graphql/generated/graphql';
import { parseAiringMedia, type AiringAnime, type AiringPageEntry } from './airing';
import { request } from './anilist-client';

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

    const idBatches: Array<number[] | undefined> = ids
        ? Array.from({ length: Math.ceil(ids.length / 250) }, (_, index) =>
              ids.slice(index * 250, index * 250 + 250)
          )
        : [undefined];
    for (const batch of idBatches) {
        for (let page = 1; ; page += 1) {
            const response = await request(
                AiringAnimePageDocument,
                { page, perPage: 50, ids: batch, schedulePage },
                { refreshAfterMs: 60 * 60 * 1_000, forceRefresh }
            );

            for (const media of response.Page?.media ?? []) {
                if (media) {
                    anime.push(parseAiringMedia(media, now));
                }
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

            const [schedulePageResult] = await getAiringPages(
                [release.id],
                now,
                forceRefresh,
                latestAiredPage
            );
            if (schedulePageResult?.latestAiredAt) {
                release.latestAiredAt = schedulePageResult.latestAiredAt;
                release.latestAiredEpisode = schedulePageResult.latestAiredEpisode;
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
