import { describe, expect, test } from 'bun:test';

import type { ProviderEpisode } from '../providers/types';
import { releaseEpisodeGroup, type EpisodeGroupBlock } from './episode-groups';
import type { AniListAnime } from './types';

function anime(episodes: number | null, start: [number, number, number]) {
  return {
    episodes,
    startDate: {
      year: start[0],
      month: start[1],
      day: start[2],
    },
  } as AniListAnime;
}

function source(titles: string[]): ProviderEpisode[] {
  return titles.map((title, index) => ({
    id: String(index + 1),
    number: index + 1,
    title,
    audio: ['sub'],
  }));
}

function block(
  firstEpisode: number,
  count: number,
  start: [number, number, number],
  titles: string[] = []
): EpisodeGroupBlock {
  return {
    episodes: Array.from({ length: count }, (_, index) => {
      const number = firstEpisode + index;
      const date = new Date(Date.UTC(start[0], start[1] - 1, start[2] + index * 7))
        .toISOString()
        .slice(0, 10);

      return {
        order: index,
        seasonNumber: 1,
        episodeNumber: number,
        title: titles[index] ?? `Episode ${number}`,
        rawAirDate: date,
        airDate: date,
        overview: `Episode ${number} overview`,
        imageUrl: `/episode-${number}.jpg`,
        runtime: 24,
      };
    }),
    order: firstEpisode === 1 ? 1 : 2,
  };
}

describe('TMDB episode groups', () => {
  test('selects a separately released second season from one absolute season', () => {
    const selected = releaseEpisodeGroup(
      anime(13, [2026, 7, 5]),
      source(['Episode 1', 'Episode 2', 'Episode 3', 'Episode 4']),
      [
        block(1, 12, [2026, 1, 11]),
        block(
          13,
          13,
          [2026, 7, 5],
          [
            'Christmas Eve',
            "Dilemma of a Winter's Night",
            "The Year That's Passed, and the Year to Come",
            'New School Term',
          ]
        ),
      ]
    );

    expect(
      selected?.slice(0, 4).map((episode) => ({
        episodeNumber: episode.episodeNumber,
        releaseEpisodeNumber: episode.releaseEpisodeNumber,
        title: episode.title,
      }))
    ).toEqual([
      {
        episodeNumber: 13,
        releaseEpisodeNumber: 1,
        title: 'Christmas Eve',
      },
      {
        episodeNumber: 14,
        releaseEpisodeNumber: 2,
        title: "Dilemma of a Winter's Night",
      },
      {
        episodeNumber: 15,
        releaseEpisodeNumber: 3,
        title: "The Year That's Passed, and the Year to Come",
      },
      {
        episodeNumber: 16,
        releaseEpisodeNumber: 4,
        title: 'New School Term',
      },
    ]);
  });

  test('rejects equally supported blocks with different inventories', () => {
    expect(
      releaseEpisodeGroup(anime(2, [2024, 1, 1]), source(['Episode 1', 'Episode 2']), [
        block(1, 2, [2024, 1, 1]),
        block(11, 2, [2024, 1, 1]),
      ])
    ).toBeNull();
  });

  test('uses an explicit season number when group dates are absent', () => {
    const selected = releaseEpisodeGroup(
      {
        ...anime(2, [2024, 1, 1]),
        title: {
          english: 'Example Season 2',
          romaji: 'Example 2nd Season',
        },
      } as AniListAnime,
      source(['Episode 1', 'Episode 2']),
      [
        {
          ...block(11, 2, [2024, 1, 1]),
          episodes: block(11, 2, [2024, 1, 1]).episodes.map((episode) => ({
            ...episode,
            rawAirDate: '',
          })),
          name: 'Season 2',
          order: 2,
        },
      ]
    );

    expect(selected?.[0]).toMatchObject({
      episodeNumber: 11,
      releaseEpisodeNumber: 1,
    });
  });

  test('does not treat a story arc order as a season number', () => {
    const arc = block(1, 10, [2015, 10, 4]);

    expect(
      releaseEpisodeGroup(
        {
          ...anime(10, [2016, 10, 8]),
          title: { english: 'Example Season 3' },
        } as AniListAnime,
        source(['Greetings', 'The Threat of the Left']),
        [
          {
            ...arc,
            name: 'Tokyo Expedition',
            order: 3,
          },
        ]
      )
    ).toBeNull();
  });
});
