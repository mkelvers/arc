import { Effect } from 'effect';

import { parseAnimeSeason, type AnimeSeasonSelection } from '$lib/anime/season';
import { positiveInteger } from '$lib/utils';
import { getSimulcastSeasonStarts } from './anilist/simulcast';
import { getSimulcastPage } from './allanime/catalog';
import { withAnimeCardPosters } from './card-posters';

async function page(selection: AnimeSeasonSelection, number: number) {
  const result = await getSimulcastPage(selection, number);

  return {
    ...result,
    anime: (await withAnimeCardPosters(result.anime)).filter(({ image }) =>
      /^https?:\/\//i.test(image)
    ),
  };
}

function seasonStarts() {
  return Effect.runPromise(getSimulcastSeasonStarts());
}

function requestedSeason(searchParams: URLSearchParams, fallback: AnimeSeasonSelection) {
  const seasonValue = searchParams.get('season');
  const yearValue = searchParams.get('year');
  if (seasonValue === null && yearValue === null) {
    return fallback;
  }

  const season = parseAnimeSeason(seasonValue);
  const year = positiveInteger(yearValue);
  return season && year ? { season, year } : null;
}

export const simulcast = {
  page,
  requestedSeason,
  seasonStarts,
};
