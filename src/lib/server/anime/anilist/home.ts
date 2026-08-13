import type { AnimeCard } from '$lib/anime/types';
import { HomeAnimeDocument, type MediaSeason } from '$lib/graphql/anilist/generated/graphql';
import { RequestCache } from '$lib/server/request-cache';
import { request } from './client';
import { selectPopularAnime } from './home-selection';
import { animeCard } from './models';
import { present } from './text';

const cache = new RequestCache<string, { season: AnimeCard[]; popular: AnimeCard[] }>(
    30 * 60 * 1_000
);

async function requestHomepage(season: MediaSeason, seasonYear: number) {
    const response = await request(
        HomeAnimeDocument,
        { season, seasonYear },
        {
            cacheForMs: 6 * 60 * 60 * 1_000,
        }
    );

    const cards = (media: NonNullable<typeof response.season>['media'] | undefined) =>
        present(media).flatMap((entry) => {
            const card = animeCard(entry);
            return card ? [card] : [];
        });

    return {
        season: cards(response.season?.media),
        popular: cards(selectPopularAnime(present(response.popular?.media))),
    };
}

export async function getHomepage(season: MediaSeason, seasonYear: number) {
    const key = `${season}:${seasonYear}`;
    return cache.get(
        key,
        () =>
            requestHomepage(season, seasonYear).catch((cause) => {
                console.error('AniList homepage refresh failed', cause);
                throw cause;
            }),
        { staleIfError: true, staleWhileRevalidate: true }
    );
}
