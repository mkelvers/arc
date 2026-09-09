import { mock, test, expect } from 'bun:test';

mock.module('$env/dynamic/private', () => ({
    env: { API_ORIGIN: 'https://api.example.test' },
}));

const page = {
    canonicalHref: null,
    anime: {
        id: 1,
        title: 'Test Anime',
        bannerImage: null,
        description: '',
        genres: [],
        format: 'TV',
        status: 'FINISHED',
        nextAiringEpisode: null,
        score: null,
        members: '0',
        favourites: '0',
        themes: [],
        studios: [],
        staff: '',
        rankings: [],
        startDate: null,
        endDate: null,
    },
    poster: null,
    logo: null,
    episodes: [
        {
            id: 'episode-1',
            number: 1,
            label: 'Episode 1',
            title: '',
            href: '/anime/1/watch/1',
            audio: ['sub'],
            image: null,
            duration: '24m',
            releaseDate: '',
            overview: '',
        },
    ],
    currentEpisode: {
        id: 'episode-1',
        number: 1,
        label: 'Episode 1',
        title: '',
        href: '/anime/1/watch/1',
        audio: ['sub'],
        image: null,
        duration: '24m',
        releaseDate: '',
        overview: '',
    },
    previousEpisode: null,
    nextEpisode: null,
    fallbackImage: null,
    startAt: 0,
    progressEventAt: 0,
};

test('watch load returns before slow playback discovery settles', async () => {
    let resolvePlayback!: (response: Response) => void;
    const playback = new Promise<Response>((resolve) => {
        resolvePlayback = resolve;
    });
    const calls: string[] = [];
    const fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith('/playback')) {
            return playback;
        }
        if (url.endsWith('/segments')) {
            return new Response(
                JSON.stringify({
                    times: {
                        opening: null,
                        ending: null,
                        sources: { opening: null, ending: null },
                    },
                    templates: { opening: null, ending: null },
                }),
                { status: 200 }
            );
        }
        return new Response(JSON.stringify(page), { status: 200 });
    };

    const { load } =
        await import('../../routes/(app)/(anime)/anime/[id]/watch/[episode]/+page.server');
    const loadPromise = Promise.resolve(
        load({
            params: { id: '1', episode: '1' },
            request: new Request('https://arc.example.test/anime/1/watch/1'),
            fetch,
        } as never)
    );
    const result = await Promise.race([
        loadPromise.then(() => 'resolved'),
        new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 25)),
    ]);

    expect(result).toBe('resolved');
    expect(calls).toEqual([
        'https://api.example.test/v1/anime/1/episodes/1',
        'https://api.example.test/v1/anime/1/episodes/1/segments',
        'https://api.example.test/v1/anime/1/episodes/1/playback',
    ]);

    const loaded = await loadPromise;
    if (!loaded || !('playback' in loaded)) {
        throw new Error('Watch load did not return page data');
    }

    const playbackState = await Promise.race([
        loaded.playback.then(() => 'resolved'),
        new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 25)),
    ]);
    expect(playbackState).toBe('pending');

    resolvePlayback(
        new Response(
            JSON.stringify({ streams: { sub: [], dub: [], raw: [] }, skipTimes: null, error: true })
        )
    );
    expect(await loaded.playback).toEqual({
        streams: { sub: [], dub: [], raw: [] },
        skipTimes: null,
        error: true,
    });
});
