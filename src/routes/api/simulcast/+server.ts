import { error, json } from '@sveltejs/kit';

import { availableAnimeSeasons, compareAnimeSeasons, currentAnimeSeason } from '$lib/anime/season';
import { anime } from '$lib/server/anime';
import { positiveInteger } from '$lib/utils';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const current = currentAnimeSeason();
  const selected = anime.simulcast.requestedSeason(url.searchParams, current);
  const page = positiveInteger(url.searchParams.get('page'));
  if (!selected || !page) {
    error(400, 'A valid season, year, and page are required');
  }
  if (compareAnimeSeasons(selected, current) > 0) {
    error(404, 'That simulcast season is not available yet');
  }

  const starts = await anime.simulcast.seasonStarts().catch((cause) => {
    console.error('Simulcast season range load failed', cause);
    error(502, 'Simulcast could not be loaded');
  });
  if (
    !availableAnimeSeasons(starts, current).some(
      (option) => option.season === selected.season && option.year === selected.year
    )
  ) {
    error(404, 'That simulcast season is not available');
  }

  try {
    return json(await anime.simulcast.page(selected, page));
  } catch (cause) {
    console.error(`Simulcast ${selected.season} ${selected.year} page ${page} load failed`, cause);
    error(502, 'More simulcast releases could not be loaded');
  }
};
