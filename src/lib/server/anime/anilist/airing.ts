import { AiringAnimePageDocument } from '$lib/graphql/anilist/generated/graphql';
import { request } from './client';

export async function getAiringAnime() {
    const anime: { id: number; airingAt: number | null; episode: number | null }[] = [];

    for (let page = 1; ; page += 1) {
        const response = await request(
            AiringAnimePageDocument,
            { page, perPage: 50 },
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
            return anime;
        }
    }
}
