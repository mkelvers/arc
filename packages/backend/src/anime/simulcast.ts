import { parseAnimeSeason, type AnimeSeasonSelection } from '@arc/shared/season';
import { positiveInteger } from '#utils';
import { getSimulcastPage as fetchSimulcastPage } from './allanime/catalog';
import { enrichAnimeCards } from './card-enrichment';

export async function simulcastPage(selection: AnimeSeasonSelection, number: number) {
    const result = await fetchSimulcastPage(selection, number);

    return {
        ...result,
        anime: (await enrichAnimeCards(result.anime)).filter(({ image }) =>
            /^https?:\/\//i.test(image)
        ),
    };
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
    const year = positiveInteger(yearValue);
    return season && year ? { season, year } : null;
}
