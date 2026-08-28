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
        expect(subtitle?.kind).toBe('direct');
        expect(subtitle?.url).toMatch(/^https:\/\/[^/]+\/.*\.m3u8(?:\?|$)/);
        expect(new URL(subtitle?.url ?? '').hostname).not.toBe('cdn.kryntal.top');
        if (subtitle?.subtitleUrl) {
            expect(subtitle.subtitleUrl).toMatch(/^https:\/\/[^/]+\/.*\.vtt(?:\?|$)/);
        }
        expect(dub?.kind).toBe('direct');
        expect(dub?.url).toMatch(/^https:\/\/[^/]+\/.*\.m3u8(?:\?|$)/);
    },
    120_000
);
