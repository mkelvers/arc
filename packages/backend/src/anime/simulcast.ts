import { parseAnimeSeason, type AnimeSeasonSelection } from '@arc/shared/season';
import { positiveInteger } from '#utils';
import { getSimulcastPage as fetchSimulcastPage } from './allanime/catalog';
import { enrichAnimeCards } from './card-enrichment';
import { discoverableAnimeIds } from './anilist/discovery';

export async function simulcastPage(selection: AnimeSeasonSelection, number: number) {
    const result = await fetchSimulcastPage(selection, number);
    const discoverable = await discoverableAnimeIds(result.anime.map(({ id }) => id));

    return {
        ...result,
        anime: (await enrichAnimeCards(result.anime)).filter(
            ({ id, image }) => discoverable.has(id) && /^https?:\/\//i.test(image)
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
