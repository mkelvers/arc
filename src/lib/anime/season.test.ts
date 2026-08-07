import { describe, expect, test } from 'bun:test';

import {
  animeSeasonLabel,
  availableAnimeSeasons,
  currentAnimeSeason,
  parseAnimeSeason,
} from './season';

describe('anime seasons', () => {
  test.each([
    [0, 'WINTER'],
    [2, 'WINTER'],
    [3, 'SPRING'],
    [5, 'SPRING'],
    [6, 'SUMMER'],
    [8, 'SUMMER'],
    [9, 'FALL'],
    [11, 'FALL'],
  ] as const)('maps UTC month %d to %s', (month, season) => {
    expect(currentAnimeSeason(new Date(Date.UTC(2026, month, 1)))).toEqual({ season, year: 2026 });
  });

  test('orders available seasons chronologically within each year', () => {
    expect(
      availableAnimeSeasons(
        {
          WINTER: 2009,
          SPRING: 2009,
          SUMMER: 2009,
          FALL: 2009,
        },
        { season: 'SPRING', year: 2010 }
      )
    ).toEqual([
      { season: 'WINTER', year: 2009 },
      { season: 'SPRING', year: 2009 },
      { season: 'SUMMER', year: 2009 },
      { season: 'FALL', year: 2009 },
      { season: 'WINTER', year: 2010 },
      { season: 'SPRING', year: 2010 },
    ]);
  });

  test('omits seasons before the provider reports their first year', () => {
    expect(
      availableAnimeSeasons(
        {
          WINTER: 2009,
          SPRING: 2010,
          SUMMER: 2010,
          FALL: 2009,
        },
        { season: 'SUMMER', year: 2010 }
      )
    ).toEqual([
      { season: 'WINTER', year: 2009 },
      { season: 'FALL', year: 2009 },
      { season: 'WINTER', year: 2010 },
      { season: 'SPRING', year: 2010 },
      { season: 'SUMMER', year: 2010 },
    ]);
  });

  test('normalizes season input and formats its label', () => {
    expect(parseAnimeSeason(' summer ')).toBe('SUMMER');
    expect(parseAnimeSeason('monsoon')).toBeUndefined();
    expect(animeSeasonLabel({ season: 'SUMMER', year: 2026 })).toBe('Summer 2026');
  });
});
