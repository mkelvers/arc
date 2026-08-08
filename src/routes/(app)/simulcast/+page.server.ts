import { error } from '@sveltejs/kit';

import {
  animeSeasonLabel,
  availableAnimeSeasons,
  compareAnimeSeasons,
  currentAnimeSeason,
} from '$lib/anime/season';
import { anime } from '$lib/server/anime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const current = currentAnimeSeason();
  const selected = anime.simulcast.requestedSeason(url.searchParams, current);
  if (!selected) {
    error(400, 'A valid season and year are required');
  }
  if (compareAnimeSeasons(selected, current) > 0) {
    error(404, 'That simulcast season is not available yet');
  }

  const [starts, page] = await Promise.all([
    anime.simulcast.seasonStarts(),
    anime.simulcast.page(selected, 1),
  ]).catch((cause) => {
    console.error('Simulcast page load failed', cause);
    error(502, 'Simulcast could not be loaded');
  });

  const seasons = availableAnimeSeasons(starts, current);
  if (!seasons.some(({ season, year }) => season === selected.season && year === selected.year)) {
    error(404, 'That simulcast season is not available');
  }
  const label = animeSeasonLabel(selected);

  return {
    pageTitle: `${label} simulcast`,
    season: selected.season,
    year: selected.year,
    label,
    options: seasons
      .map((option) => ({
        ...option,
        label: animeSeasonLabel(option),
        current: option.season === selected.season && option.year === selected.year,
        href:
          compareAnimeSeasons(option, current) === 0
            ? '/simulcast'
            : `/simulcast?season=${option.season.toLowerCase()}&year=${option.year}`,
      }))
      .toReversed(),
    page,
  };
};
