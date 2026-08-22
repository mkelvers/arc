import { AiringAnimePageDocument } from '@arc/shared/anilist/generated/graphql';
import { batches } from '#utils';
import { request } from './client';

export async function getAiringAnime(ids: number[]) {
    const anime: { id: number; airingAt: number | null; episode: number | null }[] = [];

    if (!ids.length) {
        return anime;
    }

    for (const batch of batches(ids, 250)) {
        for (let page = 1; ; page += 1) {
            const response = await request(
                AiringAnimePageDocument,
                { page, perPage: 50, ids: batch },
                { cacheForMs: 60 * 60 * 1_000 }
            );

            for (const media of response.Page?.media ?? []) {
                if (!media) {
                    continue;
                }

                anime.push({
                    id: media.id,
                    airingAt: media.nextAiringEpisode?.airingAt ?? null,
                    episode: media.nextAiringEpisode?.episode ?? null,
                });
            }

            if (!response.Page?.pageInfo?.hasNextPage) {
                break;
            }
        }
    }

    return anime;
}
