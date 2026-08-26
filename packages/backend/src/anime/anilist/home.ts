import type { AnimeCard } from '@arc/shared/types';
import { HomeAnimeDocument, type MediaSeason } from '@arc/shared/anilist/generated/graphql';
import { RequestCache } from '#request-cache';
import { request } from './client';
import { selectPopularAnime } from './home-selection';
import { animeCard } from './models';
import { present } from './text';
import { discoveryFormats, discoveryMinimumPopularity, isDiscoverableAnime } from '../discovery';

const cache = new RequestCache<string, { season: AnimeCard[]; popular: AnimeCard[] }>(
    30 * 60 * 1_000
);

async function requestHomepage(season: MediaSeason, seasonYear: number, forceRefresh = false) {
    const response = await request(
        HomeAnimeDocument,
        {
            season,
            seasonYear,
            discoveryFormats: [...discoveryFormats],
            minimumPopularity: discoveryMinimumPopularity - 1,
        },
        {
            cacheForMs: 24 * 60 * 60 * 1_000,
            forceRefresh,
        }
    );

    const cards = (media: NonNullable<typeof response.season>['media'] | undefined) =>
        present(media).flatMap((entry) => {
            if (!isDiscoverableAnime(entry)) {
                return [];
            }

            const card = animeCard(entry);
            return card ? [card] : [];
        });

    return {
        season: cards(response.season?.media),
        popular: cards(selectPopularAnime(present(response.popular?.media))),
    };
}

export function refreshHomepage(season: MediaSeason, seasonYear: number) {
    return requestHomepage(season, seasonYear, true);
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
