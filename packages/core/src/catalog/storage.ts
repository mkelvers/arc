import { eq, inArray, sql } from 'drizzle-orm';
import type { BrowseFilters } from './browse-filters';
import type { BrowseCatalogEntry } from './browse-types';
import { db } from '@arc/shared/db';
import {
    animeCatalog,
    animeCatalogRefresh,
    animeCatalogTaxonomy,
    animeRelease,
} from '@arc/shared/db/schema';
import { createAnimeSearchIndex } from './search-index';
import type { AnimeCard } from '../types';
import { AniListAnimeSchema } from './anilist-types';
import { plainText } from './anilist-text';

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
        formats: [
            ...new Set(
                rows.map(({ format }) => format).filter((value): value is string => value !== null)
            ),
        ].sort(),
        statuses: [
            ...new Set(
                rows.map(({ status }) => status).filter((value): value is string => value !== null)
            ),
        ].sort(),
        sources: [
            ...new Set(
                rows.map(({ source }) => source).filter((value): value is string => value !== null)
            ),
        ].sort(),
        seasons: [
            ...new Set(
                rows.map(({ season }) => season).filter((value): value is string => value !== null)
            ),
        ].sort(),
        fetchedAt: null,
    };
}

export async function refreshCatalogTaxonomy(
    taxonomy: {
        genres: string[];
        tags: string[];
        formats: string[];
        statuses: string[];
        sources: string[];
        seasons: string[];
    },
    fetchedAt = new Date()
) {
    await db
        .insert(animeCatalogTaxonomy)
        .values({ provider: 'anilist', ...taxonomy, fetchedAt })
        .onConflictDoUpdate({
            target: animeCatalogTaxonomy.provider,
            set: { ...taxonomy, fetchedAt },
        });

    return { ...taxonomy, fetchedAt };
}

export async function storedReleaseCards(ids: number[]): Promise<AnimeCard[]> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) {
        return [];
    }

    const rows = await db
        .select({
            id: animeRelease.anilistId,
            data: animeRelease.data,
            title: animeRelease.title,
            image: animeRelease.imageUrl,
            format: animeRelease.format,
            status: animeRelease.status,
        })
        .from(animeRelease)
        .where(inArray(animeRelease.anilistId, uniqueIds));
    const cards = new Map(
        rows.flatMap((row) => {
            const parsed = row.data ? AniListAnimeSchema.safeParse(row.data) : null;
            const media = parsed?.success ? parsed.data : null;
            const image =
                row.image ?? media?.coverImage?.extraLarge ?? media?.coverImage?.large ?? null;
            if (!image) {
                return [];
            }

            const card: AnimeCard = {
                id: row.id,
                href: `/anime/${row.id}`,
                link: `/anime/${row.id}`,
                title: row.title,
                image,
                audioLabel: '',
                format: row.format,
                status: row.status,
                score: media?.averageScore ?? 0,
                genres: media?.genres?.filter((genre): genre is string => genre !== null) ?? [],
                synopsis: plainText(media?.description),
            };
            return [[row.id, card] as const];
        })
    );

    return uniqueIds.flatMap((id) => {
        const card = cards.get(id);
        return card ? [card] : [];
    });
}
