import { eq, sql } from 'drizzle-orm';
import type { BrowseFilters } from '@arc/shared/browse';
import { present } from '@arc/shared/utils/array';
import type { BrowseCatalogEntry } from './browse-types';
import { db } from '@arc/db';
import { animeCatalog, animeCatalogRefresh, animeCatalogTaxonomy } from '@arc/db/schema';
import { createAnimeSearchIndex } from './search-index';

export function catalogSnapshotKey(filters: Omit<BrowseFilters, 'audio'>, page: number) {
    return JSON.stringify({
        discoveryCatalogRevision: 2,
        ...filters,
        query: filters.query.toLocaleLowerCase('en'),
        page,
    });
}

export async function refreshCatalogPage(
    queryKey: string,
    anime: BrowseCatalogEntry[],
    hasNextPage: boolean,
    fetchedAt = new Date()
) {
    const pageSnapshot = {
        animeIds: anime.map(({ anilistId }) => anilistId),
        hasNextPage,
    };

    await db.transaction(async (tx) => {
        if (anime.length) {
            await tx
                .insert(animeCatalog)
                .values(
                    anime.map((entry) => ({
                        ...entry,
                        discoveryRevision: 2,
                        sourceFetchedAt: fetchedAt,
                    }))
                )
                .onConflictDoUpdate({
                    target: animeCatalog.anilistId,
                    set: {
                        title: sql.raw(`excluded."${animeCatalog.title.name}"`),
                        searchText: sql.raw(`excluded."${animeCatalog.searchText.name}"`),
                        imageUrl: sql.raw(`excluded."${animeCatalog.imageUrl.name}"`),
                        synopsis: sql.raw(`excluded."${animeCatalog.synopsis.name}"`),
                        genres: sql.raw(`excluded."${animeCatalog.genres.name}"`),
                        tags: sql.raw(`excluded."${animeCatalog.tags.name}"`),
                        format: sql.raw(`excluded."${animeCatalog.format.name}"`),
                        status: sql.raw(`excluded."${animeCatalog.status.name}"`),
                        source: sql.raw(`excluded."${animeCatalog.source.name}"`),
                        season: sql.raw(`excluded."${animeCatalog.season.name}"`),
                        seasonYear: sql.raw(`excluded."${animeCatalog.seasonYear.name}"`),
                        countryOfOrigin: sql.raw(`excluded."${animeCatalog.countryOfOrigin.name}"`),
                        isAdult: sql.raw(`excluded."${animeCatalog.isAdult.name}"`),
                        popularity: sql.raw(`excluded."${animeCatalog.popularity.name}"`),
                        duration: sql.raw(`excluded."${animeCatalog.duration.name}"`),
                        discoveryRevision: sql.raw(
                            `excluded."${animeCatalog.discoveryRevision.name}"`
                        ),
                        averageScore: sql.raw(`excluded."${animeCatalog.averageScore.name}"`),
                        sourceFetchedAt: fetchedAt,
                        updatedAt: fetchedAt,
                    },
                });

            await createAnimeSearchIndex(tx).store(
                anime.map((entry) => ({
                    id: entry.anilistId,
                    href: `/anime/${entry.anilistId}`,
                    link: `/anime/${entry.anilistId}`,
                    title: entry.title,
                    titles: entry.searchText.split('\n'),
                    image: entry.imageUrl,
                    audioLabel: '',
                    score: entry.averageScore ?? 0,
                    genres: entry.genres,
                    synopsis: entry.synopsis,
                    format: entry.format,
                    popularity: entry.popularity ?? 0,
                    backdrop: null,
                    artworkGroup: null,
                    relatedIds: [],
                }))
            );
        }

        await tx
            .insert(animeCatalogRefresh)
            .values({ queryKey, ...pageSnapshot, fetchedAt })
            .onConflictDoUpdate({
                target: animeCatalogRefresh.queryKey,
                set: { ...pageSnapshot, fetchedAt },
            });
    });

    return pageSnapshot;
}

export async function catalogTaxonomy() {
    const [stored] = await db
        .select({
            genres: animeCatalogTaxonomy.genres,
            tags: animeCatalogTaxonomy.tags,
            formats: animeCatalogTaxonomy.formats,
            statuses: animeCatalogTaxonomy.statuses,
            sources: animeCatalogTaxonomy.sources,
            seasons: animeCatalogTaxonomy.seasons,
            fetchedAt: animeCatalogTaxonomy.fetchedAt,
        })
        .from(animeCatalogTaxonomy)
        .where(eq(animeCatalogTaxonomy.provider, 'anilist'))
        .limit(1);

    if (stored) {
        return stored;
    }

    const rows = await db
        .select({
            genres: animeCatalog.genres,
            tags: animeCatalog.tags,
            format: animeCatalog.format,
            status: animeCatalog.status,
            source: animeCatalog.source,
            season: animeCatalog.season,
        })
        .from(animeCatalog);
    return {
        genres: [...new Set(rows.flatMap(({ genres }) => genres))].sort(),
        tags: [...new Set(rows.flatMap(({ tags }) => tags))].sort(),
        formats: [...new Set(present(rows.map(({ format }) => format)))].sort(),
        statuses: [...new Set(present(rows.map(({ status }) => status)))].sort(),
        sources: [...new Set(present(rows.map(({ source }) => source)))].sort(),
        seasons: [...new Set(present(rows.map(({ season }) => season)))].sort(),
    };
}
