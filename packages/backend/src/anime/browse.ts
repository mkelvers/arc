import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import type { BrowseFilters } from '@arc/shared/browse';
import { audioAvailabilityLabel, type AudioMode } from '@arc/shared/audio';
import type { AnimeCard } from '@arc/shared/types';
import { db } from '@arc/db';
import type { BrowseCatalogEntry } from '@arc/core/catalog/browse-types';
import type { BrowseSourceTaxonomy } from '@arc/core/catalog/browse-transform';
import {
    animeCatalog,
    animeCatalogRefresh,
    animeCatalogTaxonomy,
    animeEpisode,
    animeEpisodeTarget,
    animeRelease,
} from '@arc/db/schema';
import { getBrowsePage, type AniListBrowseFilters } from './anilist/browse';
import { storedReleaseCards } from './anilist/releases';
import { enrichAnimeCards } from './card-enrichment';
import { popularCatalogPages } from '@arc/core/catalog/browse-pagination';
import { catalogPage as queryCatalogPage } from '@arc/core/catalog/query';
import { createAnimeSearchIndex } from './search-index';

type CatalogPageSnapshot = {
    animeIds: number[];
    hasNextPage: boolean;
};

export function browseRefreshKey(filters: AniListBrowseFilters, page: number) {
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
    } satisfies CatalogPageSnapshot;

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
                set: {
                    ...pageSnapshot,
                    fetchedAt,
                },
            });
    });

    return pageSnapshot;
}

async function ensureFreshCatalog(filters: AniListBrowseFilters, page: number) {
    const queryKey = browseRefreshKey(filters, page);
    const [stored] = await db
        .select({
            animeIds: animeCatalogRefresh.animeIds,
            hasNextPage: animeCatalogRefresh.hasNextPage,
            fetchedAt: animeCatalogRefresh.fetchedAt,
        })
        .from(animeCatalogRefresh)
        .where(eq(animeCatalogRefresh.queryKey, queryKey))
        .limit(1);

    if (stored) {
        return { ...stored, stale: true };
    }

    const result = await getBrowsePage(filters, page, 42, true);
    return {
        ...(await refreshCatalogPage(queryKey, result.anime, result.hasNextPage)),
        stale: false,
    };
}

export async function browseTaxonomy() {
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
    const values = (entries: Array<string | null>) =>
        [...new Set(entries.flatMap((value) => (value ? [value] : [])))].sort((left, right) =>
            left.localeCompare(right, 'en')
        );
    return {
        genres: [...new Set(rows.flatMap(({ genres }) => genres))].sort(),
        tags: [...new Set(rows.flatMap(({ tags }) => tags))].sort(),
        formats: values(rows.map(({ format }) => format)),
        statuses: values(rows.map(({ status }) => status)),
        sources: values(rows.map(({ source }) => source)),
        seasons: values(rows.map(({ season }) => season)),
    };
}

function validatedFilters(
    filters: BrowseFilters,
    taxonomy: BrowseSourceTaxonomy
): AniListBrowseFilters {
    if (filters.genre && filters.tag) {
        throw new BrowseFilterError('Choose either a genre or a tag');
    }
    if (filters.genre && !taxonomy.genres.includes(filters.genre)) {
        throw new BrowseFilterError('Unknown anime genre');
    }
    if (filters.tag && !taxonomy.tags.includes(filters.tag)) {
        throw new BrowseFilterError('Unknown anime tag');
    }

    if (filters.format && !taxonomy.formats.includes(filters.format)) {
        throw new BrowseFilterError('Unknown anime format');
    }
    if (filters.status && !taxonomy.statuses.includes(filters.status)) {
        throw new BrowseFilterError('Unknown anime status');
    }
    if (filters.source && !taxonomy.sources.includes(filters.source)) {
        throw new BrowseFilterError('Unknown source material');
    }
    if (filters.season && !taxonomy.seasons.includes(filters.season)) {
        throw new BrowseFilterError('Unknown anime season');
    }

    const { audio: _, ...sourceFilters } = filters;

    // AniList introspection is the runtime allowlist for these generated unions,
    // and every value was validated against it above.
    return sourceFilters as AniListBrowseFilters;
}

async function loadPage(filters: BrowseFilters, page: number) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 2_147_483_647) {
        throw new BrowseFilterError('Invalid browse page');
    }

    const taxonomy = await browseTaxonomy();
    const sourceFilters = validatedFilters(filters, taxonomy);
    const pageSnapshot = await ensureFreshCatalog(sourceFilters, page);

    const catalog = await queryCatalogPage(filters, page, pageSnapshot?.animeIds ?? null);

    return {
        anime: await enrichAnimeCards(catalog.anime),
        hasNextPage: pageSnapshot?.hasNextPage ?? catalog.hasNextPage,
        page,
        stale: pageSnapshot?.stale ?? true,
        sourceTaxonomy: taxonomy,
    };
}

export async function popularAnimePage(page: number, filters: BrowseFilters) {
    const { sourceTaxonomy: _, ...result } = await loadPage(filters, page);
    return { ...result, loadedAt: new Date().toISOString() };
}

export async function refreshPopularAnime() {
    const filters: AniListBrowseFilters = {
        query: '',
        genre: null,
        tag: null,
        format: null,
        status: null,
        source: null,
        season: null,
        year: null,
        country: null,
        safe: true,
        sort: 'popularity',
        order: 'desc',
    };
    const entries: BrowseCatalogEntry[] = [];
    for (let page = 1; ; page += 1) {
        const result = await getBrowsePage(filters, page, 42, true);
        entries.push(...result.anime);
        if (!result.hasNextPage) {
            break;
        }
    }

    const pages = popularCatalogPages(entries);
    const refreshedAt = new Date();
    for (const [index, page] of pages.entries()) {
        await refreshCatalogPage(
            browseRefreshKey(filters, index + 1),
            page,
            index < pages.length - 1,
            refreshedAt
        );
    }

    if (!pages.length) {
        await refreshCatalogPage(browseRefreshKey(filters, 1), [], false, refreshedAt);
    }

    return {
        animeIds: pages[0]?.map(({ anilistId }) => anilistId) ?? [],
        hasNextPage: pages.length > 1,
    } satisfies CatalogPageSnapshot;
}

export async function newAnimePage(page: number, filters: BrowseFilters) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 2_147_483_647) {
        throw new BrowseFilterError('Invalid catalog page');
    }

    const confirmed = await db
        .select({
            anilistId: animeEpisodeTarget.anilistId,
            episode: animeEpisodeTarget.targetEpisode,
            confirmedAt: animeEpisodeTarget.confirmedAt,
            airingAt: animeEpisodeTarget.airingAt,
        })
        .from(animeEpisodeTarget)
        .innerJoin(animeRelease, eq(animeRelease.anilistId, animeEpisodeTarget.anilistId))
        .where(
            and(
                eq(animeEpisodeTarget.state, 'confirmed'),
                lte(animeEpisodeTarget.airingAt, new Date()),
                gte(animeEpisodeTarget.airingAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000)),
                filters.status ? eq(animeRelease.status, filters.status) : undefined,
                filters.format ? eq(animeRelease.format, filters.format) : undefined
            )
        )
        .orderBy(desc(animeEpisodeTarget.confirmedAt), desc(animeEpisodeTarget.targetEpisode))
        .limit(5_000);
    const latestMap = new Map<number, (typeof confirmed)[number]>();
    for (const entry of confirmed) {
        if (!latestMap.has(entry.anilistId)) {
            latestMap.set(entry.anilistId, entry);
        }
    }
    const latest = [...latestMap.values()];
    const episodeRows = latest.length
        ? await db
              .select({ anilistId: animeEpisode.anilistId, audio: animeEpisode.audio })
              .from(animeEpisode)
              .where(
                  inArray(
                      animeEpisode.anilistId,
                      latest.map(({ anilistId }) => anilistId)
                  )
              )
        : [];
    const audioByAnime = new Map<number, Set<AudioMode>>();
    for (const row of episodeRows) {
        const modes = audioByAnime.get(row.anilistId) ?? new Set<AudioMode>();
        row.audio.forEach((mode) => modes.add(mode));
        audioByAnime.set(row.anilistId, modes);
    }
    const eligible = latest.filter((entry) => {
        const audio = [...(audioByAnime.get(entry.anilistId) ?? [])];
        return !filters.audio || audio.includes(filters.audio);
    });
    const offset = (page - 1) * 42;
    const pageEntries = eligible.slice(offset, offset + 43);
    const storedCards = new Map(
        (await storedReleaseCards(pageEntries.slice(0, 42).map(({ anilistId }) => anilistId))).map(
            (card) => [card.id, card]
        )
    );
    const cards: AnimeCard[] = pageEntries.slice(0, 42).flatMap((entry) => {
        const card = storedCards.get(entry.anilistId);
        return card
            ? [
                  {
                      ...card,
                      audioLabel: audioAvailabilityLabel([
                          ...(audioByAnime.get(entry.anilistId) ?? []),
                      ]),
                      releasedAt: (entry.confirmedAt ?? entry.airingAt).toISOString(),
                      episode: entry.episode,
                  },
              ]
            : [];
    });
    const anime = await enrichAnimeCards(cards);

    return {
        anime,
        hasNextPage: pageEntries.length > 42,
        page,
        loadedAt: new Date().toISOString(),
    };
}

export class BrowseFilterError extends Error {}
