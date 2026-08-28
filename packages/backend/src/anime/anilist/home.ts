import type { AnimeCard } from '@arc/shared/types';
import { HomeAnimeDocument, type MediaSeason } from '@arc/shared/anilist/generated/graphql';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@arc/db';
import { animeCatalog } from '@arc/db/schema';
import { request } from './client';
import { selectPopularAnime } from './home-selection';
import { animeCard } from './models';
import { present } from './text';
import { discoveryFormats, discoveryMinimumPopularity, isDiscoverableAnime } from '../discovery';

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
    const toCard = (row: typeof animeCatalog.$inferSelect): AnimeCard => ({
        id: row.anilistId,
        href: `/anime/${row.anilistId}`,
        link: `/anime/${row.anilistId}`,
        title: row.title,
        image: row.imageUrl,
        audioLabel: '',
        format: row.format,
        status: row.status,
        score: row.averageScore ?? 0,
        genres: row.genres,
        synopsis: row.synopsis,
    });
    const [seasonRows, popularRows] = await Promise.all([
        db
            .select()
            .from(animeCatalog)
            .where(
                and(
                    eq(animeCatalog.season, season),
                    eq(animeCatalog.seasonYear, seasonYear),
                    inArray(animeCatalog.status, ['RELEASING', 'FINISHED'])
                )
            )
            .orderBy(desc(animeCatalog.popularity), desc(animeCatalog.averageScore))
            .limit(24),
        db
            .select()
            .from(animeCatalog)
            .where(inArray(animeCatalog.status, ['RELEASING', 'FINISHED']))
            .orderBy(desc(animeCatalog.popularity), desc(animeCatalog.averageScore))
            .limit(24),
    ]);

    return {
        season: seasonRows.map(toCard),
        popular: popularRows.map(toCard),
    };
}
