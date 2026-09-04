import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';

import type { BrowseFilters } from '@arc/core';
import { audioAvailabilityLabel, type AudioMode } from '@arc/core';
import type { AnimeCard } from '@arc/core';
import { db } from '@arc/shared/db';
import type { BrowseSourceTaxonomy } from '@arc/core';
import {
    animeCatalog,
    animeCatalogRefresh,
    animeEpisode,
    animeEpisodeTarget,
    animeRelease,
} from '@arc/shared/db/schema';
import { getBrowsePage, type AniListBrowseFilters } from './anilist/browse';
import { storedReleaseCards } from './anilist/releases';
import { enrichAnimeCards } from './card-enrichment';
import { catalogPage as queryCatalogPage } from '@arc/core';
import {
    catalogSnapshotKey,
    catalogTaxonomy,
    refreshCatalogPage as persistCatalogPage,
} from '@arc/core';

async function ensureFreshCatalog(filters: AniListBrowseFilters, page: number) {
    const queryKey = catalogSnapshotKey(filters, page);
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
        ...(await persistCatalogPage(queryKey, result.anime, result.hasNextPage)),
        stale: false,
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

    const taxonomy = await catalogTaxonomy();
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
