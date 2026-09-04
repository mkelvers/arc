import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';

import { db } from '@arc/shared/db';
import {
    animeCatalogRefresh,
    animeEpisode,
    animeEpisodeTarget,
    animeRelease,
} from '@arc/shared/db/schema';
import { audioAvailabilityLabel, type AudioMode } from '../audio';
import type { AnimeCard } from '../types';
import type { BrowseFilters } from './browse-filters';
import { catalogPage } from './query';
import {
    catalogSnapshotKey,
    catalogTaxonomy,
    refreshCatalogPage,
    refreshCatalogTaxonomy,
    storedReleaseCards,
} from './storage';
import { refreshPopularCatalog } from './refresh';
import { currentAnimeSeason } from '../season';
import { homePage } from './home';
import { refreshReleaseCalendar, releaseCalendar } from './release-calendar';
import { createSearchOperation } from './search';
import { createSimulcastOperations } from './simulcast';
import type { BrowseSourceTaxonomy } from './browse-transform';
import type { CatalogBrowseFilters, CatalogSource } from './source';

function validatedFilters(filters: BrowseFilters, taxonomy: BrowseSourceTaxonomy) {
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

    const { audio: _audio, ...sourceFilters } = filters;
    return sourceFilters;
}

function assertPage(page: number, message: string) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 2_147_483_647) {
        throw new BrowseFilterError(message);
    }
}

function audioModes(rows: Array<{ anilistId: number; audio: AudioMode[] }>) {
    const modes = new Map<number, Set<AudioMode>>();
    for (const row of rows) {
        const animeModes = modes.get(row.anilistId) ?? new Set<AudioMode>();
        row.audio.forEach((mode) => animeModes.add(mode));
        modes.set(row.anilistId, animeModes);
    }
    return modes;
}

export function createCatalogApplication(source: CatalogSource) {
    const search = createSearchOperation(source);
    const simulcast = createSimulcastOperations(source);

    async function popularAnimePage(page: number, filters: BrowseFilters) {
        assertPage(page, 'Invalid browse page');
        const taxonomy = await catalogTaxonomy();
        const sourceFilters = validatedFilters(filters, taxonomy);
        const queryKey = catalogSnapshotKey(sourceFilters, page);
        const [stored] = await db
            .select({
                animeIds: animeCatalogRefresh.animeIds,
                hasNextPage: animeCatalogRefresh.hasNextPage,
            })
            .from(animeCatalogRefresh)
            .where(eq(animeCatalogRefresh.queryKey, queryKey))
            .limit(1);
        let pageSnapshot = stored;
        if (!pageSnapshot) {
            const result = await source.browsePage(sourceFilters, page, 42, true);
            pageSnapshot = await refreshCatalogPage(queryKey, result.anime, result.hasNextPage);
        }
        const catalog = await catalogPage(filters, page, pageSnapshot.animeIds);
        return {
            anime: await source.enrichAnimeCards(catalog.anime),
            hasNextPage: pageSnapshot.hasNextPage,
            page,
            stale: Boolean(stored),
            loadedAt: new Date().toISOString(),
        };
    }

    async function newAnimePage(page: number, filters: BrowseFilters) {
        assertPage(page, 'Invalid catalog page');
        const now = new Date();
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
                    lte(animeEpisodeTarget.airingAt, now),
                    gte(
                        animeEpisodeTarget.airingAt,
                        new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000)
                    ),
                    filters.status ? eq(animeRelease.status, filters.status) : undefined,
                    filters.format ? eq(animeRelease.format, filters.format) : undefined
                )
            )
            .orderBy(desc(animeEpisodeTarget.confirmedAt), desc(animeEpisodeTarget.targetEpisode))
            .limit(5_000);
        const latest = [...new Map(confirmed.map((entry) => [entry.anilistId, entry])).values()];
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
        const audioByAnime = audioModes(episodeRows);
        const eligible = latest.filter((entry) => {
            const audio = [...(audioByAnime.get(entry.anilistId) ?? [])];
            return !filters.audio || audio.includes(filters.audio);
        });
        const pageEntries = eligible.slice((page - 1) * 42, page * 42 + 1);
        const storedCards = new Map(
            (
                await storedReleaseCards(pageEntries.slice(0, 42).map(({ anilistId }) => anilistId))
            ).map((card) => [card.id, card])
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
        return {
            anime: await source.enrichAnimeCards(cards),
            hasNextPage: pageEntries.length > 42,
            page,
            loadedAt: new Date().toISOString(),
        };
    }

    async function refreshCatalogSnapshots(now = new Date()) {
        const { season, year } = currentAnimeSeason(now);
        const homepageFilters: CatalogBrowseFilters = {
            query: '',
            genre: null,
            tag: null,
            format: null,
            status: null,
            source: null,
            season,
            year,
            country: null,
            safe: true,
            sort: 'popularity',
            order: 'desc',
        };
        const homepage = await source.browsePage(homepageFilters, 1, 30, true);
        await refreshCatalogPage(
            catalogSnapshotKey(homepageFilters, 1),
            homepage.anime,
            homepage.hasNextPage
        );
        await refreshPopularCatalog(
            {
                ...homepageFilters,
                season: null,
                year: null,
            },
            source.browsePage,
            now
        );
        await simulcast.refreshCurrentSimulcast(now);
        await refreshCatalogTaxonomy(await source.browseTaxonomy(true));
    }

    return {
        catalogTaxonomy,
        getSearchResults: search,
        homePage: (userId: string, now?: Date) => homePage(source, userId, now),
        newAnimePage,
        popularAnimePage,
        refreshCatalogSnapshots,
        refreshCatalogTaxonomy: () => source.browseTaxonomy(true).then(refreshCatalogTaxonomy),
        refreshCurrentSimulcast: simulcast.refreshCurrentSimulcast,
        refreshReleaseCalendar: (now?: Date) => refreshReleaseCalendar(source.releaseCalendar, now),
        releaseCalendar,
        simulcast: simulcast.simulcast,
    };
}

export class BrowseFilterError extends Error {}

export type CatalogApplication = ReturnType<typeof createCatalogApplication>;
