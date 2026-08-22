import type { AnimeSeason, AnimeSeasonStartYears } from '@arc/shared/season';
import { SimulcastSeasonStartsDocument } from '@arc/shared/anilist/generated/graphql';
import { RequestCache } from '#request-cache';
import { request } from './client';

const starts = new RequestCache<string, AnimeSeasonStartYears>(24 * 60 * 60 * 1_000);

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

async function requestSeasonStarts() {
    const response = await request(
        SimulcastSeasonStartsDocument,
        {},
        {
            cacheForMs: 7 * 24 * 60 * 60 * 1_000,
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

export async function getSimulcastSeasonStarts() {
    return starts.get(
        'catalog',
        () =>
            requestSeasonStarts().catch((cause) => {
                console.error('AniList season range refresh failed', cause);
                throw cause;
            }),
        { staleIfError: true, staleWhileRevalidate: true }
    );
}
