import { describe, expect, test } from 'bun:test';

import type { ProviderEpisode } from '../providers/types';
import type { EpisodeMetadata } from '../tmdb/types';
import { episodesForRelease } from './release';
import type { AniListAnime } from './types';

function anime(episodes: number, start: [number, number, number], end: [number, number, number]) {
  return {
    episodes,
    startDate: {
      year: start[0],
      month: start[1],
      day: start[2],
    },
    endDate: {
      year: end[0],
      month: end[1],
      day: end[2],
    },
  } as AniListAnime;
}

function source(numbers: number[]): ProviderEpisode[] {
  return numbers.map((number) => ({
    id: String(number),
    number,
    title: `Episode ${number}`,
    audio: ['sub'],
  }));
}

function metadata(episodes: ProviderEpisode[], dates: string[]) {
  return new Map<string, EpisodeMetadata>(
    episodes.map((episode, index) => [
      episode.id,
      {
        title: episode.title,
        overview: '',
        imageUrl: null,
        runtime: 24,
        airDate: '',
        rawAirDate: dates[index],
      },
    ])
  );
}

describe('AniList release episode boundaries', () => {
  test('removes a later part combined into the first part inventory', () => {
    const episodes = source(Array.from({ length: 22 }, (_, index) => index + 1));
    const dates = [
      ...Array.from({ length: 12 }, (_, index) =>
        new Date(Date.UTC(2018, 6, 23 + index * 7)).toISOString().slice(0, 10)
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        new Date(Date.UTC(2019, 3, 29 + index * 7)).toISOString().slice(0, 10)
      ),
    ];

    expect(
      episodesForRelease(
        anime(12, [2018, 7, 23], [2018, 10, 15]),
        episodes,
        metadata(episodes, dates)
      ).map(({ number }) => number)
    ).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
  });

  test('selects the later part without changing provider episode IDs', () => {
    const episodes = source(Array.from({ length: 22 }, (_, index) => index + 1));
    const dates = [
      ...Array.from({ length: 12 }, (_, index) =>
        new Date(Date.UTC(2018, 6, 23 + index * 7)).toISOString().slice(0, 10)
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        new Date(Date.UTC(2019, 3, 29 + index * 7)).toISOString().slice(0, 10)
      ),
    ];

    expect(
      episodesForRelease(
        anime(10, [2019, 4, 29], [2019, 7, 1]),
        episodes,
        metadata(episodes, dates)
      ).map(({ id }) => id)
    ).toEqual(Array.from({ length: 10 }, (_, index) => String(index + 13)));
  });

  test('keeps in-window recap specials in addition to regular episodes', () => {
    const episodes = source([
      0,
      ...Array.from({ length: 17 }, (_, index) => index + 1),
      17.5,
      ...Array.from({ length: 7 }, (_, index) => index + 18),
    ]);
    const dates = episodes.map((_, index) =>
      new Date(Date.UTC(2024, 2, 30 + index * 7)).toISOString().slice(0, 10)
    );

    expect(
      episodesForRelease(
        anime(24, [2024, 4, 5], [2024, 9, 27]),
        episodes,
        metadata(episodes, dates)
      )
    ).toHaveLength(26);
  });

  test('drops an unmatched provider pre-roll when regular episodes match', () => {
    const episodes = source([0, ...Array.from({ length: 12 }, (_, index) => index + 1)]);
    const matched = metadata(
      episodes.slice(1),
      Array.from({ length: 12 }, (_, index) =>
        new Date(Date.UTC(2025, 0, 1 + index * 7)).toISOString().slice(0, 10)
      )
    );

    expect(
      episodesForRelease(anime(12, [2025, 1, 1], [2025, 3, 19]), episodes, matched).map(
        ({ number }) => number
      )
    ).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
  });

  test('drops unconfirmed later-provider inventory candidates', () => {
    const canonical = source(Array.from({ length: 13 }, (_, index) => index + 1));
    const supplemental = source(Array.from({ length: 12 }, (_, index) => index + 14)).map(
      (episode) => ({
        ...episode,
        supplemental: true,
      })
    );
    const episodes = [...canonical, ...supplemental];
    const matched = metadata(
      canonical,
      Array.from({ length: 13 }, (_, index) =>
        new Date(Date.UTC(2020, 6, 9 + index * 7)).toISOString().slice(0, 10)
      )
    );

    expect(
      episodesForRelease(anime(13, [2020, 7, 9], [2020, 10, 2]), episodes, matched).map(
        ({ number }) => number
      )
    ).toEqual(Array.from({ length: 13 }, (_, index) => index + 1));
  });
});
