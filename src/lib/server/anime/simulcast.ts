import { parseAnimeSeason, type AnimeSeasonSelection } from '$lib/anime/season';
import { positiveInteger } from '$lib/utils';
import { getSimulcastPage as fetchSimulcastPage } from './allanime/catalog';
import { withAnimeCardPosters } from './card-posters';

export async function simulcastPage(selection: AnimeSeasonSelection, number: number) {
  const result = await fetchSimulcastPage(selection, number);

  return {
    ...result,
    anime: (await withAnimeCardPosters(result.anime)).filter(({ image }) =>
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
