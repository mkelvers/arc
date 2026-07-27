import { describe, expect, test } from 'bun:test';

import { createProviderFallback } from './fallback';
import type {
    PlaybackProvider,
    ProviderAnime,
    ProviderStream,
} from './types';

const anime = { id: 1 } as ProviderAnime;
const episode = { id: '1', number: 1 };
const stream: ProviderStream = {
    url: 'https://media.example/episode.m3u8',
    quality: null,
    audioDelay: 0,
};

function provider(
    name: string,
    methods: Partial<PlaybackProvider>,
): PlaybackProvider {
    return {
        name,
        getEpisodes: async () => [],
        getStreams: async () => ({}),
        ...methods,
    };
}

describe('playback provider fallback', () => {
    test('uses the first provider with an episode inventory', async () => {
        const attempts: string[] = [];
        const playback = createProviderFallback([
            provider('first', {
                getEpisodes: async () => {
                    attempts.push('first');
                    throw new Error('offline');
                },
            }),
            provider('second', {
                getEpisodes: async () => {
                    attempts.push('second');
                    return [
                        {
                            id: '1',
                            number: 1,
                            title: '',
                            audio: ['sub'],
                        },
                    ];
                },
            }),
            provider('third', {
                getEpisodes: async () => {
                    attempts.push('third');
                    return [];
                },
            }),
        ]);

        expect(await playback.getEpisodes(anime)).toHaveLength(1);
        expect(attempts).toEqual(['first', 'second']);
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

        const result = await playback.getStreams(anime, episode, [
            'sub',
            'dub',
        ]);
        expect(result.sub).toEqual([stream]);
        expect(result.dub).toEqual([stream]);
        expect(attempts).toEqual([
            'sub:sub,dub',
            'dub:dub',
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
            expect(String(cause)).toContain(
                'No playback provider returned a stream',
            );
        }
    });
});
