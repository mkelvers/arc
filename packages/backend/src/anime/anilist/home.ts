import type { AnimeCard } from '@arc/core';
import type { MediaSeason } from '@arc/shared/graphql/generated/graphql';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@arc/shared/db';
import { animeCatalog } from '@arc/shared/db/schema';
import { getBrowsePage, type AniListBrowseFilters } from './browse';
import { catalogSnapshotKey, refreshCatalogPage } from '@arc/core';

export async function refreshHomepage(season: MediaSeason, seasonYear: number) {
    const filters: AniListBrowseFilters = {
        query: '',
        genre: null,
        tag: null,
        format: null,
        status: null,
        source: null,
        season,
        year: seasonYear,
        country: null,
        safe: true,
        sort: 'popularity',
        order: 'desc',
    };
    const result = await getBrowsePage(filters, 1, 30, true);
    await refreshCatalogPage(catalogSnapshotKey(filters, 1), result.anime, result.hasNextPage);
    return result;
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
