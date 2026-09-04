import { and, asc, eq } from 'drizzle-orm';

import { AnimeCardPageSchema } from '../types';
import {
    availableAnimeSeasons,
    compareAnimeSeasons,
    currentAnimeSeason,
    parseAnimeSeason,
    type AnimeSeason,
    type AnimeSeasonSelection,
    type AnimeSeasonStartYears,
} from '../season';
import { db } from '@arc/shared/db';
import { animeCatalog, animeSimulcastPage } from '@arc/shared/db/schema';
import type { CatalogSource } from './source';

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

function seasonLabel(season: AnimeSeason, year: number) {
    return `${season[0]}${season.slice(1).toLowerCase()} ${year}`;
}

export function createSimulcastOperations(source: CatalogSource) {
    async function refreshSimulcastPage(selection: AnimeSeasonSelection, page: number) {
        const data = AnimeCardPageSchema.parse(await source.simulcastPage(selection, page));
        const fetchedAt = new Date();
        await db
            .insert(animeSimulcastPage)
            .values({
                provider: 'anikoto',
                season: selection.season,
                year: selection.year,
                page,
                data,
                fetchedAt,
            })
            .onConflictDoUpdate({
                target: [
                    animeSimulcastPage.provider,
                    animeSimulcastPage.season,
                    animeSimulcastPage.year,
                    animeSimulcastPage.page,
                ],
                set: { data, fetchedAt },
            });
        return data;
    }

    async function simulcastPage(selection: AnimeSeasonSelection, page: number) {
        if (!Number.isSafeInteger(page) || page <= 0) {
            throw new RangeError('Simulcast page must be a positive integer');
        }
        const [stored] = await db
            .select({ data: animeSimulcastPage.data })
            .from(animeSimulcastPage)
            .where(
                and(
                    eq(animeSimulcastPage.provider, 'anikoto'),
                    eq(animeSimulcastPage.season, selection.season),
                    eq(animeSimulcastPage.year, selection.year),
                    eq(animeSimulcastPage.page, page)
                )
            )
            .limit(1);
        const parsed = AnimeCardPageSchema.safeParse(stored?.data);
        return parsed.success ? parsed.data : refreshSimulcastPage(selection, page);
    }

    async function simulcast(searchParams: URLSearchParams, page: number) {
        const current = currentAnimeSeason();
        const latest = nextAnimeSeason(current);
        const seasonValue = searchParams.get('season');
        const yearValue = searchParams.get('year');
        const selected =
            seasonValue === null && yearValue === null
                ? current
                : (() => {
                      const season = parseAnimeSeason(seasonValue);
                      const year = Number(yearValue);
                      return season && Number.isSafeInteger(year) && year > 0
                          ? { season, year }
                          : null;
                  })();
        if (!selected || compareAnimeSeasons(selected, latest) > 0) {
            return null;
        }
        const [starts, result] = await Promise.all([
            db
                .select({ season: animeCatalog.season, year: animeCatalog.seasonYear })
                .from(animeCatalog)
                .where(eq(animeCatalog.isAdult, false))
                .orderBy(asc(animeCatalog.seasonYear))
                .then((rows) => {
                    const values: AnimeSeasonStartYears = {};
                    for (const row of rows) {
                        const season = parseAnimeSeason(row.season);
                        if (season && row.year && values[season] === undefined) {
                            values[season] = row.year;
                        }
                    }
                    return values;
                }),
            simulcastPage(selected, page),
        ]);
        const seasons = availableAnimeSeasons(starts, latest);
        if (
            !seasons.some(
                ({ season, year }) => season === selected.season && year === selected.year
            )
        ) {
            return null;
        }
        return {
            season: selected.season,
            year: selected.year,
            label: seasonLabel(selected.season, selected.year),
            options: seasons
                .map((option) => ({
                    ...option,
                    label: seasonLabel(option.season, option.year),
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

    async function refreshCurrentSimulcast(now = new Date()) {
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

    return { refreshCurrentSimulcast, simulcast };
}
