import { parseAnimeSeason, type AnimeSeason, type AnimeSeasonStartYears } from '@arc/shared/season';
import { SimulcastSeasonStartsDocument } from '@arc/shared/anilist/generated/graphql';
import { asc, eq } from 'drizzle-orm';
import { db } from '@arc/db';
import { animeCatalog } from '@arc/db/schema';
import { request } from './client';

function startYear(
    media:
        | Array<{
              seasonYear: number | null;
          } | null>
        | null
        | undefined
) {
    const year = media?.[0]?.seasonYear;
    return year && Number.isSafeInteger(year) && year > 0 ? year : undefined;
}

async function requestSeasonStarts(forceRefresh = false) {
    const response = await request(
        SimulcastSeasonStartsDocument,
        {},
        {
            cacheForMs: 7 * 24 * 60 * 60 * 1_000,
            forceRefresh,
        }
    );
    const entries: Array<[AnimeSeason, number | undefined]> = [
        ['WINTER', startYear(response.winter?.media)],
        ['SPRING', startYear(response.spring?.media)],
        ['SUMMER', startYear(response.summer?.media)],
        ['FALL', startYear(response.fall?.media)],
    ];

    return Object.fromEntries(
        entries.filter((entry): entry is [AnimeSeason, number] => entry[1] !== undefined)
    );
}

export function refreshSimulcastSeasonStarts() {
    return requestSeasonStarts(true);
}

export async function getSimulcastSeasonStarts() {
    const rows = await db
        .select({ season: animeCatalog.season, year: animeCatalog.seasonYear })
        .from(animeCatalog)
        .where(eq(animeCatalog.isAdult, false))
        .orderBy(asc(animeCatalog.seasonYear));
    const result: AnimeSeasonStartYears = {};
    for (const row of rows) {
        const season = parseAnimeSeason(row.season);
        if (row.year && season && result[season] === undefined) {
            result[season] = row.year;
        }
    }
    return result;
}
