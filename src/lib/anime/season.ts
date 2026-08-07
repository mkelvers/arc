export const animeSeasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;

export type AnimeSeason = (typeof animeSeasons)[number];

export interface AnimeSeasonSelection {
  season: AnimeSeason;
  year: number;
}

export type AnimeSeasonStartYears = Partial<Record<AnimeSeason, number>>;

export function parseAnimeSeason(value: string | null | undefined) {
  const season = value?.trim().toUpperCase();

  return animeSeasons.find((candidate) => candidate === season);
}

export function currentAnimeSeason(now = new Date()): AnimeSeasonSelection {
  return {
    season: animeSeasons[Math.floor(now.getUTCMonth() / 3)],
    year: now.getUTCFullYear(),
  };
}

export function compareAnimeSeasons(left: AnimeSeasonSelection, right: AnimeSeasonSelection) {
  return (
    left.year - right.year || animeSeasons.indexOf(left.season) - animeSeasons.indexOf(right.season)
  );
}

export function availableAnimeSeasons(starts: AnimeSeasonStartYears, latest: AnimeSeasonSelection) {
  const firstYear = Math.min(
    ...animeSeasons.flatMap((season) => {
      const year = starts[season];
      return year && year > 0 ? [year] : [];
    })
  );
  if (!Number.isSafeInteger(firstYear)) {
    return [];
  }

  const options: AnimeSeasonSelection[] = [];
  for (let year = firstYear; year <= latest.year; year++) {
    for (const season of animeSeasons) {
      const firstSeasonYear = starts[season];
      const option = { season, year };
      if (firstSeasonYear && year >= firstSeasonYear && compareAnimeSeasons(option, latest) <= 0) {
        options.push(option);
      }
    }
  }

  return options;
}

export function animeSeasonLabel({ season, year }: AnimeSeasonSelection) {
  return `${season[0]}${season.slice(1).toLowerCase()} ${year}`;
}
