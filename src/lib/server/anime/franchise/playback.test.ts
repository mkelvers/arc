import { describe, expect, test } from 'bun:test';

import type { FranchiseOrder } from '$lib/anime/types';
import { type FranchisePlaybackEpisode, withFranchisePlayback } from './playback';

function entry(anilistId: number, caption: string): FranchiseOrder['entries'][number] {
  return {
    malId: anilistId,
    anilistId,
    id: anilistId,
    type: 'TV',
    title: `Anime ${anilistId}`,
    image: '',
    caption,
    score: 0,
    genres: [],
    synopsis: '',
    secondary: false,
    primary: true,
    href: `/anime/${anilistId}`,
    watchHref: `/anime/${anilistId}`,
  };
}

describe('withFranchisePlayback', () => {
  test('overlays current audio facts on every cached franchise entry', () => {
    const cached = [entry(1, 'Dub | Sub'), entry(2, '')];
    const episodes: FranchisePlaybackEpisode[] = [
      { anilistId: 1, episodeId: '2', number: 2, audio: ['dub'] },
      {
        anilistId: 1,
        episodeId: '1',
        number: 1,
        audio: ['sub'],
      },
      {
        anilistId: 2,
        episodeId: 'special',
        number: 1,
        audio: ['sub', 'dub'],
      },
    ];

    const current = withFranchisePlayback(cached, episodes);

    expect(
      current.map(({ caption, watchHref }) => ({
        caption,
        watchHref,
      }))
    ).toEqual([
      {
        caption: 'Dub | Sub',
        watchHref: '/anime/1/watch/1',
      },
      {
        caption: 'Dub | Sub',
        watchHref: '/anime/2/watch/special',
      },
    ]);
  });

  test('does not retain playback values without current episode facts', () => {
    const [current] = withFranchisePlayback(
      [
        {
          ...entry(1, 'Dub | Sub'),
          watchHref: '/anime/1/watch/stale',
        },
      ],
      []
    );

    expect(current?.caption).toBe('');
    expect(current?.watchHref).toBe('/anime/1');
  });
});
