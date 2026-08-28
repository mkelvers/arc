import { expect, test } from 'bun:test';

import { anikotoProvider } from './anikoto';

const liveTest = process.env.LIVE_PROVIDER_TESTS === '1' ? test : test.skip;

liveTest(
    'AniKoto resolves a current SUB and DUB journey to native HLS',
    async () => {
        const { getAnime } = await import('../anilist/details');
        const anime = await getAnime(176496);
        const episodes = await anikotoProvider.getEpisodes(anime);
        const episode = episodes.find(({ number }) => number === 5);

        expect(episodes.length).toBeGreaterThan(0);
        expect(episode?.audio).toEqual(expect.arrayContaining(['sub', 'dub']));
        if (!episode) {
            throw new Error('AniKoto returned no episode 5');
        }

        const streams = await anikotoProvider.getStreams(anime, episode, ['sub', 'dub']);
        const subtitle = streams.sub?.[0];
        const dub = streams.dub?.[0];
        expect(subtitle?.provider).toBe('anikoto');
        expect(subtitle?.server).toBeTruthy();
        expect(subtitle?.url).toMatch(/^https:\/\/[^/]+\/.*\.m3u8(?:\?|$)/);
        expect(new URL(subtitle?.url ?? '').hostname).not.toBe('cdn.kryntal.top');
        expect(subtitle?.subtitles.every(({ url }) => url.startsWith('/v1/stream'))).toBe(false);
        expect(
            subtitle?.subtitles.every(({ url }) => /^https:\/\/[^/]+\/.*\.vtt(?:\?|$)/.test(url))
        ).toBe(true);
        expect(dub?.provider).toBe('anikoto');
        expect(dub?.server).toBeTruthy();
        expect(dub?.url).toMatch(/^https:\/\/[^/]+\/.*\.m3u8(?:\?|$)/);
    },
    120_000
);

liveTest(
    'AniKoto keeps playable SUB and DUB siblings for current Tensura episode 1',
    async () => {
        const { getAnime } = await import('../anilist/details');
        const anime = await getAnime(182205);
        const episodes = await anikotoProvider.getEpisodes(anime);
        const episode = episodes.find(({ number }) => number === 1);

        expect(episode?.audio).toEqual(expect.arrayContaining(['sub', 'dub']));
        if (!episode) {
            throw new Error('AniKoto returned no episode 1');
        }

        const streams = await anikotoProvider.getStreams(anime, episode, ['sub', 'dub']);
        for (const mode of ['sub', 'dub'] as const) {
            expect(streams[mode]?.length).toBeGreaterThan(0);
            expect(
                streams[mode]?.every(
                    (stream) =>
                        stream.provider === 'anikoto' &&
                        stream.server.length > 0 &&
                        /^https:\/\/[^/]+\/.*\.m3u8(?:\?|$)/.test(stream.url)
                )
            ).toBe(true);
        }
    },
    120_000
);
