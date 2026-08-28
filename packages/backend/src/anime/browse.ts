import { and, arrayContains, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import type { BrowseFilters } from '@arc/shared/browse';
import { audioAvailabilityLabel, type AudioMode } from '@arc/shared/audio';
import type { AnimeCard } from '@arc/shared/types';
import { db, excluded } from '@arc/db';
import {
    animeCatalog,
    animeCatalogRefresh,
    animeCatalogTaxonomy,
    animeEpisode,
    animeEpisodeTarget,
    animeRelease,
} from '@arc/db/schema';
import {
    getBrowsePage,
    type AniListBrowseFilters,
    type BrowseCatalogEntry,
    type BrowseSourceTaxonomy,
} from './anilist/browse';
import { storedReleaseCards } from './anilist/releases';
import { enrichAnimeCards } from './card-enrichment';
import { popularCatalogPages } from './catalog-pagination';
import { createAnimeSearchIndex } from './search-index';
import {
    discoveryCatalogRevision,
    discoveryFormats,
    discoveryMinimumDuration,
    discoveryMinimumPopularity,
} from './discovery';

type CatalogCachePage = {
    animeIds: number[];
    hasNextPage: boolean;
};

function browseRefreshKey(filters: AniListBrowseFilters, page: number) {
    return JSON.stringify({
        discoveryCatalogRevision,
        ...filters,
        query: filters.query.toLocaleLowerCase('en'),
        page,
    });
}

async function refreshCatalogPage(
    queryKey: string,
    anime: BrowseCatalogEntry[],
    hasNextPage: boolean,
    fetchedAt = new Date()
) {
    const cachePage = {
        animeIds: anime.map(({ anilistId }) => anilistId),
        hasNextPage,
    } satisfies CatalogCachePage;

    await db.transaction(async (tx) => {
        if (anime.length) {
            await tx
                .insert(animeCatalog)
                .values(
                    anime.map((entry) => ({
                        ...entry,
                        discoveryRevision: discoveryCatalogRevision,
                        sourceFetchedAt: fetchedAt,
                    }))
                )
                .onConflictDoUpdate({
                    target: animeCatalog.anilistId,
                    set: {
                        title: excluded(animeCatalog.title),
                        searchText: excluded(animeCatalog.searchText),
                        imageUrl: excluded(animeCatalog.imageUrl),
                        synopsis: excluded(animeCatalog.synopsis),
                        genres: excluded(animeCatalog.genres),
                        tags: excluded(animeCatalog.tags),
                        format: excluded(animeCatalog.format),
                        status: excluded(animeCatalog.status),
                        source: excluded(animeCatalog.source),
                        season: excluded(animeCatalog.season),
                        seasonYear: excluded(animeCatalog.seasonYear),
                        countryOfOrigin: excluded(animeCatalog.countryOfOrigin),
                        isAdult: excluded(animeCatalog.isAdult),
                        popularity: excluded(animeCatalog.popularity),
                        duration: excluded(animeCatalog.duration),
                        discoveryRevision: excluded(animeCatalog.discoveryRevision),
                        averageScore: excluded(animeCatalog.averageScore),
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
            .values({ queryKey, ...cachePage, fetchedAt })
            .onConflictDoUpdate({
                target: animeCatalogRefresh.queryKey,
                set: { ...cachePage, fetchedAt },
            });
    });

    return cachePage;
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

async function sourceTaxonomy() {
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

function escapeLike(value: string) {
    return value.replace(/[\\%_]/g, '\\$&');
}

function hasAudio(mode: AudioMode) {
    return sql<boolean>`exists (
        select 1
        from ${animeEpisode}
        where ${animeEpisode.anilistId} = ${animeCatalog.anilistId}
          and cast(${mode} as episode_audio) = any(${animeEpisode.audio})
    )`;
}

function catalogConditions(filters: BrowseFilters) {
    return and(
        filters.query
            ? sql`${animeCatalog.searchText} ilike ${`%${escapeLike(filters.query)}%`} escape '\\'`
            : undefined,
        filters.format === 'MOVIE'
            ? eq(animeCatalog.format, 'MOVIE')
            : inArray(animeCatalog.format, [...discoveryFormats]),
        sql`${animeCatalog.popularity} >= ${discoveryMinimumPopularity}`,
        sql`(${animeCatalog.duration} is null or ${animeCatalog.duration} >= ${discoveryMinimumDuration})`,
        eq(animeCatalog.discoveryRevision, discoveryCatalogRevision),
        filters.safe ? eq(animeCatalog.isAdult, false) : undefined,
        filters.genre ? arrayContains(animeCatalog.genres, [filters.genre]) : undefined,
        filters.tag ? arrayContains(animeCatalog.tags, [filters.tag]) : undefined,
        filters.status ? eq(animeCatalog.status, filters.status) : undefined,
        filters.format && filters.format !== 'MOVIE'
            ? eq(animeCatalog.format, filters.format)
            : undefined,
        filters.source ? eq(animeCatalog.source, filters.source) : undefined,
        filters.season ? eq(animeCatalog.season, filters.season) : undefined,
        filters.year ? eq(animeCatalog.seasonYear, filters.year) : undefined,
        filters.country ? eq(animeCatalog.countryOfOrigin, filters.country) : undefined,
        filters.audio === 'dub' ? hasAudio('dub') : undefined,
        filters.audio === 'sub' ? hasAudio('sub') : undefined
    );
}

function catalogOrder(filters: BrowseFilters) {
    const popularityDescending = sql`${animeCatalog.popularity} desc nulls last`;
    const titleAscending = sql`${animeCatalog.title} asc`;

    if (filters.sort === 'score') {
        return [
            filters.order === 'asc'
                ? sql`${animeCatalog.averageScore} asc nulls last`
                : sql`${animeCatalog.averageScore} desc nulls last`,
            popularityDescending,
            titleAscending,
            asc(animeCatalog.anilistId),
        ];
    }

    return [
        filters.order === 'asc'
            ? sql`${animeCatalog.popularity} asc nulls last`
            : popularityDescending,
        titleAscending,
        asc(animeCatalog.anilistId),
    ];
}

function audioModes(row: { hasSub: boolean; hasDub: boolean; hasRaw: boolean }) {
    const modes: AudioMode[] = [];
    if (row.hasSub) {
        modes.push('sub');
    }
    if (row.hasDub) {
        modes.push('dub');
    }
    if (row.hasRaw) {
        modes.push('raw');
    }
    return modes;
}

async function catalogPage(filters: BrowseFilters, page: number, animeIds: number[] | null) {
    if (animeIds?.length === 0) {
        return { anime: [], hasNextPage: false };
    }

    const rows = await db
        .select({
            id: animeCatalog.anilistId,
            title: animeCatalog.title,
            image: animeCatalog.imageUrl,
            score: animeCatalog.averageScore,
            genres: animeCatalog.genres,
            synopsis: animeCatalog.synopsis,
            hasSub: hasAudio('sub'),
            hasDub: hasAudio('dub'),
            hasRaw: hasAudio('raw'),
        })
        .from(animeCatalog)
        .where(
            and(
                catalogConditions(filters),
                animeIds ? inArray(animeCatalog.anilistId, animeIds) : undefined
            )
        )
        .orderBy(...catalogOrder(filters))
        .limit(43)
        .offset(animeIds ? 0 : (page - 1) * 42);

    const orderedRows = animeIds
        ? animeIds.flatMap((id) => {
              const row = rows.find((candidate) => candidate.id === id);
              return row ? [row] : [];
          })
        : rows;

    const cards: AnimeCard[] = orderedRows.slice(0, 42).map((row) => {
        return {
            id: row.id,
            href: `/anime/${row.id}`,
            link: `/anime/${row.id}`,
            title: row.title,
            image: row.image,
            audioLabel: audioAvailabilityLabel(audioModes(row)),
            score: row.score ?? 0,
            genres: row.genres,
            synopsis: row.synopsis,
        };
    });

    return {
        anime: await enrichAnimeCards(cards),
        hasNextPage: orderedRows.length > 42,
    };
}

async function loadPage(filters: BrowseFilters, page: number) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 2_147_483_647) {
        throw new BrowseFilterError('Invalid browse page');
    }

    const taxonomy = await sourceTaxonomy();
    const sourceFilters = validatedFilters(filters, taxonomy);
    const cachePage = await ensureFreshCatalog(sourceFilters, page);

    const catalog = await catalogPage(filters, page, cachePage?.animeIds ?? null);

    return {
        anime: catalog.anime,
        hasNextPage: cachePage?.hasNextPage ?? catalog.hasNextPage,
        page,
        stale: cachePage?.stale ?? true,
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
    } satisfies CatalogCachePage;
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
