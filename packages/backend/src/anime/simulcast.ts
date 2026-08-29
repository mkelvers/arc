import {
    availableAnimeSeasons,
    compareAnimeSeasons,
    currentAnimeSeason,
    parseAnimeSeason,
    type AnimeSeason,
    type AnimeSeasonSelection,
    type AnimeSeasonStartYears,
} from '@arc/shared/season';
import { asc, eq } from 'drizzle-orm';

import { db } from '@arc/db';
import { animeCatalog, animeCatalogRefresh } from '@arc/db/schema';
import { storedDiscoverableAnimeCards } from './browse';
import { getAniKotoSimulcastPage } from './providers/anikoto';

function refreshKey(selection: AnimeSeasonSelection, page: number) {
    return JSON.stringify({ provider: 'anikoto', kind: 'simulcast', ...selection, page });
}

export function requestedSimulcastSeason(
    searchParams: URLSearchParams,
    fallback: AnimeSeasonSelection
) {
    const seasonValue = searchParams.get('season');
    const yearValue = searchParams.get('year');
    if (seasonValue === null && yearValue === null) {
        return fallback;
    }

    const season = parseAnimeSeason(seasonValue);
    const year = Number(yearValue);
    return season && Number.isSafeInteger(year) && year > 0 ? { season, year } : null;
}

async function seasonStarts() {
    const rows = await db
        .select({ season: animeCatalog.season, year: animeCatalog.seasonYear })
        .from(animeCatalog)
        .where(eq(animeCatalog.isAdult, false))
        .orderBy(asc(animeCatalog.seasonYear));
    const starts: AnimeSeasonStartYears = {};
    for (const row of rows) {
        const season = parseAnimeSeason(row.season);
        if (season && row.year && starts[season] === undefined) {
            starts[season] = row.year;
        }
    }
    return starts;
}

export async function refreshSimulcastPage(selection: AnimeSeasonSelection, page: number) {
    const result = await getAniKotoSimulcastPage(selection, page);
    await db
        .insert(animeCatalogRefresh)
        .values({
            queryKey: refreshKey(selection, page),
            animeIds: result.animeIds,
            hasNextPage: result.hasNextPage,
            fetchedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: animeCatalogRefresh.queryKey,
            set: {
                animeIds: result.animeIds,
                hasNextPage: result.hasNextPage,
                fetchedAt: new Date(),
            },
        });
    return result;
}

async function simulcastPage(selection: AnimeSeasonSelection, page: number) {
    if (!Number.isSafeInteger(page) || page <= 0) {
        throw new RangeError('Simulcast page must be a positive integer');
    }

    const [stored] = await db
        .select({
            animeIds: animeCatalogRefresh.animeIds,
            hasNextPage: animeCatalogRefresh.hasNextPage,
        })
        .from(animeCatalogRefresh)
        .where(eq(animeCatalogRefresh.queryKey, refreshKey(selection, page)))
        .limit(1);
    const snapshot = stored ?? (await refreshSimulcastPage(selection, page));

    return {
        anime: await storedDiscoverableAnimeCards(snapshot.animeIds),
        hasNextPage: snapshot.hasNextPage,
        page,
    };
}

export async function refreshCurrentSimulcast(now = new Date()) {
    const selection = currentAnimeSeason(now);
    for (let page = 1; ; page += 1) {
        const result = await refreshSimulcastPage(selection, page);
        if (!result.hasNextPage) {
            return;
        }
    }
}

function label(season: AnimeSeason, year: number) {
    return `${season[0]}${season.slice(1).toLowerCase()} ${year}`;
}

export async function simulcast(searchParams: URLSearchParams, page: number) {
    const current = currentAnimeSeason();
    const selected = requestedSimulcastSeason(searchParams, current);
    if (!selected || compareAnimeSeasons(selected, current) > 0) {
        return null;
    }

    const [starts, result] = await Promise.all([seasonStarts(), simulcastPage(selected, page)]);
    const seasons = availableAnimeSeasons(starts, current);
    if (!seasons.some(({ season, year }) => season === selected.season && year === selected.year)) {
        return null;
    }

    return {
        season: selected.season,
        year: selected.year,
        label: label(selected.season, selected.year),
        options: seasons
            .map((option) => ({
                ...option,
                label: label(option.season, option.year),
                current: option.season === selected.season && option.year === selected.year,
                href:
                    compareAnimeSeasons(option, current) === 0
                        ? '/simulcast'
                        : `/simulcast?season=${option.season.toLowerCase()}&year=${option.year}`,
            }))
            .toReversed(),
        page: result,
    };
}
