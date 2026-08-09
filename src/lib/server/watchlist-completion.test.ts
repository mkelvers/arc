import { describe, expect, test } from 'bun:test';

import { watchlistStateAfterEpisodeCompletion } from './watchlist-completion';

const episodes = [
  { episodeId: 'one', number: 1 },
  { episodeId: 'two', number: 2 },
  { episodeId: 'three', number: 3 },
];

describe('automatic watchlist status', () => {
  test('completes a finished release after its verified final provider episode', () => {
    expect(
      watchlistStateAfterEpisodeCompletion(
        'watching',
        { mediaStatus: 'FINISHED', expectedEpisodes: 3 },
        episodes,
        episodes[2]
      )
    ).toBe('completed');
  });

  test('keeps an airing release in watching after its latest episode', () => {
    expect(
      watchlistStateAfterEpisodeCompletion(
        'plan_to_watch',
        { mediaStatus: 'RELEASING', expectedEpisodes: 12 },
        episodes,
        episodes[2]
      )
    ).toBe('watching');
  });

  test('does not complete an incomplete provider inventory', () => {
    expect(
      watchlistStateAfterEpisodeCompletion(
        null,
        { mediaStatus: 'FINISHED', expectedEpisodes: 4 },
        episodes,
        episodes[2]
      )
    ).toBe('watching');
  });

  test('ignores a completion report outside the stored provider inventory', () => {
    expect(
      watchlistStateAfterEpisodeCompletion(
        null,
        { mediaStatus: 'RELEASING', expectedEpisodes: 12 },
        episodes,
        { episodeId: 'invented', number: 4 }
      )
    ).toBeNull();
  });

  test('does not reorder an already completed entry', () => {
    expect(
      watchlistStateAfterEpisodeCompletion(
        'completed',
        { mediaStatus: 'RELEASING', expectedEpisodes: 12 },
        episodes,
        episodes[2]
      )
    ).toBe('completed');
  });
});
