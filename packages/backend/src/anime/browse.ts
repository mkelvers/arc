import { and, arrayContains, eq, inArray, sql } from 'drizzle-orm';

import type { BrowseFilters, BrowseTaxonomy } from '@arc/shared/browse';
import { audioAvailabilityLabel, type AudioMode } from '@arc/shared/audio';
import type { AnimeCard } from '@arc/shared/types';
import { db, excluded } from '@arc/db';
import {
    animeCatalog,
    animeCatalogRefresh,
    animeCatalogTaxonomy,
    animeEpisode,
    animeRelease,
} from '@arc/db/schema';
import {
    getBrowseAnime,
    getBrowsePage,
    getBrowseTaxonomy,
    type AniListBrowseFilters,
    type BrowseSourceTaxonomy,
} from './anilist/browse';
import { getRecentAiringPage } from './anilist/recent';
import { enrichAnimeCards } from './card-enrichment';
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
const activeRefreshes = new Map<string, Promise<CatalogCachePage>>();
let activeTaxonomyRefresh: Promise<BrowseSourceTaxonomy> | null = null;

function browseRefreshKey(filters: AniListBrowseFilters, page: number) {
    return JSON.stringify({
        discoveryCatalogRevision,
        ...filters,
        query: filters.query.toLocaleLowerCase('en'),
        page,
    });
}

async function refreshCatalog(filters: AniListBrowseFilters, queryKey: string, pageNumber: number) {
    const result = await getBrowsePage(filters, pageNumber, 42);
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
                result.anime.map((entry) => ({
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
        if (stored) {
            void refresh.catch((cause) => {
                console.warn(
                    `AniList browse page ${page} refresh failed; using stored values`,
                    cause
                );
            });
        }
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
            provider: 'anilist',
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
        .where(eq(animeCatalogTaxonomy.provider, 'anilist'))
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

async function observedFormats(taxonomy: BrowseSourceTaxonomy) {
    const [catalog, releases] = await Promise.all([
        db
            .select({ value: animeCatalog.format })
            .from(animeCatalog)
            .where(sql`${animeCatalog.format} is not null`)
            .groupBy(animeCatalog.format),
        db
            .select({ value: animeRelease.format })
            .from(animeRelease)
            .where(sql`${animeRelease.format} is not null`)
            .groupBy(animeRelease.format),
    ]);
    const observed = new Set(
        [...catalog, ...releases].flatMap(({ value }) => (value ? [value] : []))
    );

    return taxonomy.formats.filter(
        (format) =>
            discoveryFormats.includes(format as (typeof discoveryFormats)[number]) &&
            observed.has(format)
    );
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
        .limit(42)
        .offset(animeIds ? 0 : (page - 1) * 42);

    const orderedRows = animeIds
        ? animeIds.flatMap((id) => {
              const row = rows.find((candidate) => candidate.id === id);
              return row ? [row] : [];
          })
        : rows;

    const cards: AnimeCard[] = orderedRows.map((row) => {
        return {
            id: row.id,
            href: `/anime/${row.id}`,
            link: `/anime/${row.id}`,
            title: row.title,
            image: row.image,
            audioLabel: audioAvailabilityLabel(audioModes(row)) || 'Audio not indexed',
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
        hasNextPage: cachePage?.hasNextPage ?? anime.length === 42,
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

export async function popularAnimePage(page: number, filters: BrowseFilters) {
    const { sourceTaxonomy: _, ...result } = await loadPage(filters, page);
    return { ...result, loadedAt: new Date().toISOString() };
}

export async function newAnimePage(page: number, filters: BrowseFilters) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 2_147_483_647) {
        throw new BrowseFilterError('Invalid catalog page');
    }

    const recent = await getRecentAiringPage(page);
    const latestSchedules = [
        ...new Map(recent.schedules.map((schedule) => [schedule.anilistId, schedule])).values(),
    ];
    const entries = (
        await getBrowseAnime(latestSchedules.map(({ anilistId }) => anilistId))
    ).filter(
        (entry) =>
            (!filters.status || entry.status === filters.status) &&
            (!filters.format || entry.format === filters.format)
    );
    const episodeRows = entries.length
        ? await db
              .select({ anilistId: animeEpisode.anilistId, audio: animeEpisode.audio })
              .from(animeEpisode)
              .where(
                  inArray(
                      animeEpisode.anilistId,
                      entries.map(({ anilistId }) => anilistId)
                  )
              )
        : [];
    const audioByAnime = new Map<number, Set<AudioMode>>();
    for (const row of episodeRows) {
        const modes = audioByAnime.get(row.anilistId) ?? new Set<AudioMode>();
        row.audio.forEach((mode) => modes.add(mode));
        audioByAnime.set(row.anilistId, modes);
    }
    const entryById = new Map(entries.map((entry) => [entry.anilistId, entry]));
    const cards: AnimeCard[] = latestSchedules.flatMap((schedule) => {
        const entry = entryById.get(schedule.anilistId);
        if (!entry) {
            return [];
        }
        const audio = [...(audioByAnime.get(entry.anilistId) ?? [])];
        if (filters.audio && !audio.includes(filters.audio)) {
            return [];
        }
        return [
            {
                id: entry.anilistId,
                href: `/anime/${entry.anilistId}`,
                link: `/anime/${entry.anilistId}`,
                title: entry.title,
                image: entry.imageUrl,
                audioLabel: audioAvailabilityLabel(audio) || 'Audio not indexed',
                score: entry.averageScore ?? 0,
                genres: entry.genres,
                synopsis: entry.synopsis,
                releasedAt: schedule.airedAt.toISOString(),
                episode: schedule.episode,
            },
        ];
    });
    const anime = await enrichAnimeCards(cards);

    return {
        anime,
        hasNextPage: recent.hasNextPage,
        page,
        loadedAt: new Date().toISOString(),
    };
}

export class BrowseFilterError extends Error {}
