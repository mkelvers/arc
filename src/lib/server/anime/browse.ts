import { and, arrayContains, eq, inArray, sql } from 'drizzle-orm';

import { browsePageSize, type BrowseFilters, type BrowseTaxonomy } from '$lib/anime/browse';
import { audioAvailabilityLabel, type AudioMode } from '$lib/anime/audio';
import type { AnimeCard } from '$lib/anime/types';
import { db } from '$lib/server/db';
import {
    animeCatalog,
    animeCatalogRefresh,
    animeCatalogTaxonomy,
    animeDetailsCache,
    animeEpisode,
} from '$lib/server/db/schema';
import {
    getBrowsePage,
    getBrowseTaxonomy,
    isMediaFormat,
    isMediaStatus,
    type AniListBrowseFilters,
    type BrowseSourceTaxonomy,
} from './anilist/browse';
import type { MediaSeason, MediaSource } from '$lib/graphql/anilist/generated/graphql';
import { enrichAnimeCards } from './card-enrichment';

type CatalogCachePage = {
    animeIds: number[];
    hasNextPage: boolean;
};
const activeRefreshes = new Map<string, Promise<CatalogCachePage>>();
let activeTaxonomyRefresh: Promise<BrowseSourceTaxonomy> | null = null;
const taxonomyProvider = 'anilist';

function excluded(column: { name: string }) {
    return sql.raw(`excluded."${column.name}"`);
}

function browseRefreshKey(filters: AniListBrowseFilters, page: number) {
    return JSON.stringify({
        query: filters.query.toLocaleLowerCase('en'),
        safe: filters.safe,
        genre: filters.genre,
        tag: filters.tag,
        status: filters.status,
        format: filters.format,
        source: filters.source,
        season: filters.season,
        year: filters.year,
        country: filters.country,
        sort: filters.sort,
        order: filters.order,
        page,
    });
}

async function refreshCatalog(filters: AniListBrowseFilters, queryKey: string, pageNumber: number) {
    const result = await getBrowsePage(filters, pageNumber, browsePageSize);
    const fetchedAt = new Date();
    const cachePage = {
        animeIds: result.anime.map(({ anilistId }) => anilistId),
        hasNextPage: result.hasNextPage,
    } satisfies CatalogCachePage;

    await db.transaction(async (tx) => {
        if (result.anime.length) {
            await tx
                .insert(animeCatalog)
                .values(
                    result.anime.map((entry) => ({
                        ...entry,
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
                        averageScore: excluded(animeCatalog.averageScore),
                        sourceFetchedAt: fetchedAt,
                        updatedAt: fetchedAt,
                    },
                });
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

    if (stored && Date.now() - stored.fetchedAt.getTime() < 24 * 60 * 60 * 1_000) {
        return { ...stored, stale: false };
    }

    const startRefresh = () => {
        const active = activeRefreshes.get(queryKey);
        if (active) {
            return active;
        }

        const refresh = refreshCatalog(filters, queryKey, page);
        activeRefreshes.set(queryKey, refresh);
        const cleanup = () => {
            if (activeRefreshes.get(queryKey) === refresh) {
                activeRefreshes.delete(queryKey);
            }
        };
        refresh.then(cleanup, cleanup);
        return refresh;
    };

    const refresh = startRefresh();
    if (stored) {
        void refresh.catch((cause) => {
            console.warn(`AniList browse page ${page} refresh failed; using stored values`, cause);
        });
        return { ...stored, stale: true };
    }

    return { ...(await refresh), stale: false };
}

async function refreshTaxonomy() {
    const taxonomy = await getBrowseTaxonomy();
    const fetchedAt = new Date();

    await db
        .insert(animeCatalogTaxonomy)
        .values({
            provider: taxonomyProvider,
            ...taxonomy,
            fetchedAt,
        })
        .onConflictDoUpdate({
            target: animeCatalogTaxonomy.provider,
            set: { ...taxonomy, fetchedAt },
        });

    return taxonomy;
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
        .where(eq(animeCatalogTaxonomy.provider, taxonomyProvider))
        .limit(1);

    if (
        stored &&
        stored.tags.length > 0 &&
        stored.sources.length > 0 &&
        stored.seasons.length > 0 &&
        Date.now() - stored.fetchedAt.getTime() < 7 * 24 * 60 * 60 * 1_000
    ) {
        return stored;
    }

    if (!activeTaxonomyRefresh) {
        activeTaxonomyRefresh = refreshTaxonomy().finally(() => {
            activeTaxonomyRefresh = null;
        });
    }

    if (stored) {
        void activeTaxonomyRefresh.catch((cause) => {
            console.warn('AniList browse taxonomy refresh failed; using stored values', cause);
        });
        return stored;
    }

    return activeTaxonomyRefresh;
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

    const format = (() => {
        if (!filters.format) {
            return null;
        }
        if (!isMediaFormat(taxonomy, filters.format)) {
            throw new BrowseFilterError('Unknown anime format');
        }
        return filters.format;
    })();
    const status = (() => {
        if (!filters.status) {
            return null;
        }
        if (!isMediaStatus(taxonomy, filters.status)) {
            throw new BrowseFilterError('Unknown anime status');
        }
        return filters.status;
    })();

    if (filters.source && !taxonomy.sources.includes(filters.source)) {
        throw new BrowseFilterError('Unknown source material');
    }
    if (filters.season && !taxonomy.seasons.includes(filters.season)) {
        throw new BrowseFilterError('Unknown anime season');
    }

    const { audio: _, ...sourceFilters } = filters;

    return {
        ...sourceFilters,
        format,
        status,
        source: filters.source as MediaSource | null,
        season: filters.season as MediaSeason | null,
    };
}

async function observedFormats(taxonomy: BrowseSourceTaxonomy) {
    const cachedFormat = sql<string | null>`${animeDetailsCache.data}->>'format'`;
    const [catalog, details] = await Promise.all([
        db
            .select({ value: animeCatalog.format })
            .from(animeCatalog)
            .where(sql`${animeCatalog.format} is not null`)
            .groupBy(animeCatalog.format),
        db
            .select({ value: cachedFormat })
            .from(animeDetailsCache)
            .where(sql`${cachedFormat} is not null`)
            .groupBy(cachedFormat),
    ]);
    const observed = new Set(
        [...catalog, ...details].flatMap(({ value }) => (value ? [value] : []))
    );

    return taxonomy.formats.filter((format) => observed.has(format));
}

async function pageTaxonomy(taxonomy: BrowseSourceTaxonomy): Promise<BrowseTaxonomy> {
    const [years, countries] = await Promise.all([
        db
            .select({ value: animeCatalog.seasonYear })
            .from(animeCatalog)
            .where(sql`${animeCatalog.seasonYear} is not null`)
            .groupBy(animeCatalog.seasonYear)
            .orderBy(sql`${animeCatalog.seasonYear} desc`),
        db
            .select({ value: animeCatalog.countryOfOrigin })
            .from(animeCatalog)
            .where(sql`${animeCatalog.countryOfOrigin} is not null`)
            .groupBy(animeCatalog.countryOfOrigin)
            .orderBy(animeCatalog.countryOfOrigin),
    ]);

    return {
        genres: taxonomy.genres,
        tags: taxonomy.tags,
        formats: await observedFormats(taxonomy),
        statuses: taxonomy.statuses,
        sources: taxonomy.sources,
        seasons: taxonomy.seasons,
        years: years.flatMap(({ value }) => (value ? [value] : [])),
        countries: countries.flatMap(({ value }) => (value ? [value] : [])),
    };
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

const hasSub = hasAudio('sub');
const hasDub = hasAudio('dub');
const hasRaw = hasAudio('raw');

function catalogConditions(filters: BrowseFilters) {
    return and(
        filters.query
            ? sql`${animeCatalog.searchText} ilike ${`%${escapeLike(filters.query)}%`} escape '\\'`
            : undefined,
        filters.safe ? eq(animeCatalog.isAdult, false) : undefined,
        filters.genre ? arrayContains(animeCatalog.genres, [filters.genre]) : undefined,
        filters.tag ? arrayContains(animeCatalog.tags, [filters.tag]) : undefined,
        filters.status ? eq(animeCatalog.status, filters.status) : undefined,
        filters.format ? eq(animeCatalog.format, filters.format) : undefined,
        filters.source ? eq(animeCatalog.source, filters.source) : undefined,
        filters.season ? eq(animeCatalog.season, filters.season) : undefined,
        filters.year ? eq(animeCatalog.seasonYear, filters.year) : undefined,
        filters.country ? eq(animeCatalog.countryOfOrigin, filters.country) : undefined,
        filters.audio === 'dub' ? hasDub : undefined
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
        ];
    }

    return [
        filters.order === 'asc'
            ? sql`${animeCatalog.popularity} asc nulls last`
            : popularityDescending,
        titleAscending,
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
        return [];
    }

    const rows = await db
        .select({
            id: animeCatalog.anilistId,
            title: animeCatalog.title,
            image: animeCatalog.imageUrl,
            score: animeCatalog.averageScore,
            genres: animeCatalog.genres,
            synopsis: animeCatalog.synopsis,
            hasSub,
            hasDub,
            hasRaw,
        })
        .from(animeCatalog)
        .where(
            and(
                catalogConditions(filters),
                animeIds ? inArray(animeCatalog.anilistId, animeIds) : undefined
            )
        )
        .orderBy(...catalogOrder(filters))
        .limit(browsePageSize)
        .offset(animeIds ? 0 : (page - 1) * browsePageSize);

    const orderedRows = animeIds
        ? animeIds.flatMap((id) => {
              const row = rows.find((candidate) => candidate.id === id);
              return row ? [row] : [];
          })
        : rows;

    const cards: AnimeCard[] = orderedRows.map((row) => {
        const label = audioAvailabilityLabel(audioModes(row));

        return {
            id: row.id,
            href: `/anime/${row.id}`,
            link: `/anime/${row.id}`,
            title: row.title,
            image: row.image,
            audioLabel: label || 'Audio not indexed',
            score: row.score ?? 0,
            genres: row.genres,
            synopsis: row.synopsis,
        };
    });

    return enrichAnimeCards(cards);
}

async function loadPage(filters: BrowseFilters, page: number) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 2_147_483_647) {
        throw new BrowseFilterError('Invalid browse page');
    }

    const taxonomy = await sourceTaxonomy();
    const sourceFilters = validatedFilters(filters, taxonomy);
    let refreshFailed = false;
    let cachePage: Awaited<ReturnType<typeof ensureFreshCatalog>> | null = null;

    try {
        cachePage = await ensureFreshCatalog(sourceFilters, page);
    } catch (cause) {
        refreshFailed = true;
        console.warn(`Anime catalog page ${page} refresh failed; using stored results`, cause);
    }

    const anime = await catalogPage(filters, page, cachePage?.animeIds ?? null);
    if (refreshFailed && !anime.length) {
        throw new Error('The anime catalog could not be loaded');
    }

    return {
        anime,
        hasNextPage: cachePage?.hasNextPage ?? anime.length === browsePageSize,
        page,
        stale: refreshFailed || cachePage?.stale === true,
        sourceTaxonomy: taxonomy,
    };
}

export async function initialBrowsePage(filters: BrowseFilters) {
    const { sourceTaxonomy: taxonomy, ...result } = await loadPage(filters, 1);

    return { ...result, taxonomy: await pageTaxonomy(taxonomy) };
}

export async function browsePage(filters: BrowseFilters, number: number) {
    const { sourceTaxonomy: _, ...result } = await loadPage(filters, number);
    return result;
}

export class BrowseFilterError extends Error {}
