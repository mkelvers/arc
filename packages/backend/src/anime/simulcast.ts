import {
    availableAnimeSeasons,
    compareAnimeSeasons,
    currentAnimeSeason,
    parseAnimeSeason,
    type AnimeSeason,
    type AnimeSeasonSelection,
    type AnimeSeasonStartYears,
} from '@arc/shared/season';
import { AnimeCardPageSchema } from '@arc/shared/types';
import { and, asc, eq } from 'drizzle-orm';

import { db } from '@arc/db';
import { animeCatalog, animeSimulcastPageCache } from '@arc/db/schema';
import { getAniKotoSimulcastPage } from './providers/anikoto';

const provider = 'anikoto';

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
    const data = AnimeCardPageSchema.parse(result);
    await db
        .insert(animeSimulcastPageCache)
        .values({
            provider,
            season: selection.season,
            year: selection.year,
            page,
            data,
            fetchedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: [
                animeSimulcastPageCache.provider,
                animeSimulcastPageCache.season,
                animeSimulcastPageCache.year,
                animeSimulcastPageCache.page,
            ],
            set: {
                data,
                fetchedAt: new Date(),
            },
        });
    return data;
}

async function simulcastPage(selection: AnimeSeasonSelection, page: number) {
    if (!Number.isSafeInteger(page) || page <= 0) {
        throw new RangeError('Simulcast page must be a positive integer');
    }

    const [stored] = await db
        .select({ data: animeSimulcastPageCache.data })
        .from(animeSimulcastPageCache)
        .where(
            and(
                eq(animeSimulcastPageCache.provider, provider),
                eq(animeSimulcastPageCache.season, selection.season),
                eq(animeSimulcastPageCache.year, selection.year),
                eq(animeSimulcastPageCache.page, page)
            )
        )
        .limit(1);
    const cached = AnimeCardPageSchema.safeParse(stored?.data);
    return cached.success ? cached.data : refreshSimulcastPage(selection, page);
}

export async function refreshCurrentSimulcast(now = new Date()) {
    const current = currentAnimeSeason(now);
    for (const selection of [current, nextAnimeSeason(current)]) {
        for (let page = 1; ; page += 1) {
            const result = await refreshSimulcastPage(selection, page);
            if (!result.hasNextPage) {
                break;
            }
        }
    }
}

function nextAnimeSeason(selection: AnimeSeasonSelection): AnimeSeasonSelection {
    switch (selection.season) {
        case 'WINTER':
            return { season: 'SPRING', year: selection.year };
        case 'SPRING':
            return { season: 'SUMMER', year: selection.year };
        case 'SUMMER':
            return { season: 'FALL', year: selection.year };
        case 'FALL':
            return { season: 'WINTER', year: selection.year + 1 };
    }
}

function label(season: AnimeSeason, year: number) {
    return `${season[0]}${season.slice(1).toLowerCase()} ${year}`;
}

export async function simulcast(searchParams: URLSearchParams, page: number) {
    const current = currentAnimeSeason();
    const latest = nextAnimeSeason(current);
    const selected = requestedSimulcastSeason(searchParams, current);
    if (!selected || compareAnimeSeasons(selected, latest) > 0) {
        return null;
    }

    const [starts, result] = await Promise.all([seasonStarts(), simulcastPage(selected, page)]);
    const seasons = availableAnimeSeasons(starts, latest);
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
