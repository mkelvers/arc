import { describe, expect, test } from 'bun:test';

import { createProviderFallback } from './fallback';
import type { PlaybackProvider, ProviderAnime, ProviderStream } from './types';

const anime = { id: 1 } as ProviderAnime;
const episode = { id: '1', number: 1 };
const stream: ProviderStream = {
  url: 'https://media.example/episode.m3u8',
  quality: null,
  audioDelay: 0,
};
const alternateStream: ProviderStream = {
  url: 'https://fallback.example/episode.m3u8',
  quality: '720p',
  audioDelay: 0,
};
const from = (provider: string, value: ProviderStream) => ({
  ...value,
  provider,
});

function provider(name: string, methods: Partial<PlaybackProvider>): PlaybackProvider {
  return {
    name,
    getEpisodes: async () => [],
    getStreams: async () => ({}),
    ...methods,
  };
}

describe('playback provider fallback', () => {
  test('uses the first inventory and unions matching audio modes', async () => {
    const attempts: string[] = [];
    const playback = createProviderFallback([
      provider('first', {
        getEpisodes: async () => {
          attempts.push('first');
          return [
            {
              id: 'primary-1',
              number: 1,
              title: 'Episode One',
              audio: ['sub'],
            },
            {
              id: 'primary-2',
              number: 2,
              title: 'Episode Two',
              audio: ['sub'],
            },
          ];
        },
      }),
      provider('second', {
        getEpisodes: async () => {
          attempts.push('second');
          return [
            {
              id: 'fallback-1',
              number: 1,
              title: '',
              audio: ['dub'],
            },
          ];
        },
      }),
      provider('third', {
        getEpisodes: async () => {
          attempts.push('third');
          throw new Error('offline');
        },
      }),
    ]);

    expect(await playback.getEpisodes(anime)).toEqual([
      {
        id: 'primary-1',
        number: 1,
        title: 'Episode One',
        audio: ['sub', 'dub'],
      },
      {
        id: 'primary-2',
        number: 2,
        title: 'Episode Two',
        audio: ['sub'],
      },
    ]);
    expect(attempts).toEqual(['first', 'second', 'third']);
  });

  test('chooses the closest complete inventory and matches reordered audio', async () => {
    const playback = createProviderFallback([
      provider('combined', {
        getEpisodes: async () => [
          {
            id: 'combined-1',
            number: 1,
            title: 'Hey! Butts!',
            audio: ['sub'],
          },
          {
            id: 'combined-2',
            number: 2,
            title: 'The Tragedy of M?',
            audio: ['sub'],
          },
          {
            id: 'combined-3',
            number: 3,
            title: 'Another Release',
            audio: ['sub'],
          },
        ],
      }),
      provider('release', {
        getEpisodes: async () => [
          {
            id: 'release-1',
            number: 1,
            title: 'The Tragedy of M?',
            audio: ['dub'],
          },
          {
            id: 'release-2',
            number: 2,
            title: 'Hey! Butts!',
            audio: ['dub'],
          },
        ],
      }),
    ]);

    expect(
      await playback.getEpisodes({
        ...anime,
        episodes: 2,
      })
    ).toEqual([
      {
        id: 'release-1',
        number: 1,
        title: 'The Tragedy of M?',
        audio: ['sub', 'dub'],
      },
      {
        id: 'release-2',
        number: 2,
        title: 'Hey! Butts!',
        audio: ['sub', 'dub'],
      },
    ]);
  });

  test('fails closed when a finished release inventory is incomplete', async () => {
    const playback = createProviderFallback([
      provider('incomplete', {
        getEpisodes: async () => [
          {
            id: 'one',
            number: 1,
            title: 'First',
            audio: ['sub'],
          },
        ],
      }),
    ]);

    await expect(
      playback.getEpisodes({
        ...anime,
        status: 'FINISHED',
        episodes: 2,
      })
    ).rejects.toThrow('No playback provider returned the complete finished release');
  });

  test('retains a later-provider fractional special as a candidate', async () => {
    const playback = createProviderFallback([
      provider('with-special', {
        getEpisodes: async () => [
          {
            id: 'special',
            number: 0.5,
            title: 'Recap',
            audio: ['sub'],
          },
          {
            id: 'first-1',
            number: 1,
            title: 'First',
            audio: ['sub'],
          },
          {
            id: 'first-2',
            number: 2,
            title: 'Second',
            audio: ['sub'],
          },
        ],
      }),
      provider('exact', {
        getEpisodes: async () => [
          {
            id: 'exact-1',
            number: 1,
            title: 'First',
            audio: ['dub'],
          },
          {
            id: 'exact-2',
            number: 2,
            title: 'Second',
            audio: ['dub'],
          },
        ],
      }),
    ]);

    expect(
      await playback.getEpisodes({
        ...anime,
        episodes: 2,
      })
    ).toEqual([
      {
        id: 'special',
        number: 0.5,
        title: 'Recap',
        audio: ['sub'],
        supplemental: true,
      },
      {
        id: 'exact-1',
        number: 1,
        title: 'First',
        audio: ['sub', 'dub'],
      },
      {
        id: 'exact-2',
        number: 2,
        title: 'Second',
        audio: ['sub', 'dub'],
      },
    ]);
  });

  test('fills missing audio modes from later providers', async () => {
    const attempts: string[] = [];
    const playback = createProviderFallback([
      provider('sub-provider', {
        getStreams: async (_anime, _episode, modes) => {
          attempts.push(`sub:${modes.join(',')}`);
          return { sub: [stream] };
        },
      }),
      provider('dub-provider', {
        getStreams: async (_anime, _episode, modes) => {
          attempts.push(`dub:${modes.join(',')}`);
          return { dub: [stream] };
        },
      }),
    ]);

    const result = await playback.getStreams(anime, episode, ['sub', 'dub']);
    expect(result.sub).toEqual([from('sub-provider', stream)]);
    expect(result.dub).toEqual([from('dub-provider', stream)]);
    expect(attempts).toEqual(['sub:sub,dub', 'dub:sub,dub']);
  });

  test('retains same-mode source alternatives in provider order', async () => {
    const attempts: string[] = [];
    const playback = createProviderFallback([
      provider('first', {
        getStreams: async (_anime, _episode, modes) => {
          attempts.push(`first:${modes.join(',')}`);
          return { sub: [stream] };
        },
      }),
      provider('second', {
        getStreams: async (_anime, _episode, modes) => {
          attempts.push(`second:${modes.join(',')}`);
          return { sub: [alternateStream] };
        },
      }),
    ]);

    const result = await playback.getStreams(anime, episode, ['sub']);
    expect(result.sub).toEqual([from('first', stream), from('second', alternateStream)]);
    expect(attempts).toEqual(['first:sub', 'second:sub']);
  });

  test('represents an unavailable requested audio mode explicitly', async () => {
    const playback = createProviderFallback([
      provider('sub-provider', {
        getStreams: async () => ({ sub: [stream] }),
      }),
      provider('offline-provider', {
        getStreams: async () => {
          throw new Error('offline');
        },
      }),
    ]);

    const result = await playback.getStreams(anime, episode, ['sub', 'dub']);
    expect(result.sub).toEqual([from('sub-provider', stream)]);
    expect(result.dub).toEqual([]);
  });

  test('preserves source-specific subtitles on later sub alternatives', async () => {
    const subtitleUrl = 'https://media.example/episode.vtt';
    const playback = createProviderFallback([
      provider('video-only', {
        getStreams: async () => ({ sub: [stream] }),
      }),
      provider('captioned', {
        getStreams: async () => ({
          sub: [{ ...alternateStream, subtitleUrl }],
        }),
      }),
    ]);

    const result = await playback.getStreams(anime, episode, ['sub']);
    expect(result.sub).toEqual([
      from('video-only', stream),
      from('captioned', {
        ...alternateStream,
        subtitleUrl,
      }),
    ]);
  });

  test('preserves every provider failure in one aggregate error', async () => {
    const playback = createProviderFallback([
      provider('first', {
        getStreams: async () => {
          throw new Error('offline');
        },
      }),
      provider('second', {
        getStreams: async () => ({}),
      }),
    ]);

    try {
      await playback.getStreams(anime, episode, ['sub']);
      throw new Error('Expected playback fallback to fail');
    } catch (cause) {
      expect(cause).toBeInstanceOf(AggregateError);
      expect((cause as AggregateError).errors).toHaveLength(2);
      expect((cause as AggregateError).errors.map(String)).toEqual([
        'Error: first streams failed: offline',
        'Error: second streams failed: no sub stream was returned',
      ]);
      expect(String(cause)).toContain('No playback provider returned a stream');
    }
  });

  test('cools down a challenge-blocked provider between watch retries', async () => {
    let attempts = 0;
    const playback = createProviderFallback([
      provider('challenged', {
        getStreams: async () => {
          attempts++;
          throw new Error('NEED_CAPTCHA');
        },
      }),
    ]);

    await expect(playback.getStreams(anime, episode, ['sub'])).rejects.toBeInstanceOf(
      AggregateError
    );
    await expect(playback.getStreams(anime, episode, ['sub'])).rejects.toBeInstanceOf(
      AggregateError
    );
    expect(attempts).toBe(1);
  });
});
