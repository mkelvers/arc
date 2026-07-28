import { afterEach, describe, expect, mock, test } from 'bun:test';

import type { ProviderAnime } from './types';

let storedMediaId: string | null = null;

mock.module('./mapping', () => ({
    providerMediaId: async () => storedMediaId,
    saveProviderMediaId: async (
        _anilistId: number,
        _provider: string,
        id: string,
    ) => {
        storedMediaId = id;
    },
    verifyProviderMediaId: async () => {},
}));

const { anikotoProvider } = await import('./anikoto');
const nativeFetch = globalThis.fetch;
const anime = {
    id: 154587,
    idMal: 52991,
    title: {
        english: "Frieren: Beyond Journey's End",
        romaji: 'Sousou no Frieren',
        native: '葬送のフリーレン',
    },
    synonyms: [],
} as unknown as ProviderAnime;

function response(value: unknown, status = 200) {
    return new Response(
        typeof value === 'string' ? value : JSON.stringify(value),
        { status },
    );
}

function seriesPayload() {
    return {
        ok: true,
        data: {
            anime: {
                id: 6351,
                ani_id: 154587,
                mal_id: '52991',
                title: "Frieren: Beyond Journey's End",
            },
            episodes: [
                {
                    number: 1,
                    title: 'The Journey&#39;s End',
                    episode_embed_id: '107257',
                    embed_url: {
                        sub: 'https://megaplay.buzz/stream/s-2/107257/sub',
                        dub: 'https://megaplay.buzz/stream/s-2/107257/dub',
                    },
                },
                {
                    number: 2,
                    title: 'It Didn&#39;t Have to Be Magic...',
                    episode_embed_id: '107259',
                    embed_url: {
                        sub: 'https://megaplay.buzz/stream/s-2/107259/sub',
                        dub: null,
                    },
                },
            ],
        },
    };
}

afterEach(() => {
    globalThis.fetch = nativeFetch;
    storedMediaId = null;
});

describe('AniKoto provider', () => {
    test('maps the exact AniList identity and keeps per-episode audio availability', async () => {
        globalThis.fetch = mock(async (input: string | URL | Request) => {
            const url = new URL(
                input instanceof Request ? input.url : input.toString(),
            );
            if (url.hostname === 'anikototv.to') {
                return response(`
                    <main class="main">
                        <div class="item">
                            <div class="poster" data-tip="6351"></div>
                            <a class="name" data-jp="Sousou no Frieren">
                                Frieren: Beyond Journey's End
                            </a>
                        </div>
                    </main>
                `);
            }
            if (
                url.hostname === 'anikotoapi.site' &&
                url.pathname === '/series/6351'
            ) {
                return response(seriesPayload());
            }
            throw new Error(`Unexpected request: ${url}`);
        }) as unknown as typeof fetch;

        const episodes = await anikotoProvider.getEpisodes(anime);

        expect(storedMediaId).toBe('6351');
        expect(episodes).toEqual([
            {
                id: '1',
                number: 1,
                title: "The Journey's End",
                audio: ['sub', 'dub'],
            },
            {
                id: '2',
                number: 2,
                title: "It Didn't Have to Be Magic...",
                audio: ['sub'],
            },
        ]);
    });

    test('resolves independent sub and dub HLS sources with captions on sub', async () => {
        storedMediaId = '6351';
        globalThis.fetch = mock(async (input: string | URL | Request) => {
            const url = new URL(
                input instanceof Request ? input.url : input.toString(),
            );
            if (
                url.hostname === 'anikotoapi.site' &&
                url.pathname === '/series/6351'
            ) {
                return response(seriesPayload());
            }
            if (
                url.hostname === 'megaplay.buzz' &&
                url.pathname.startsWith('/stream/s-2/')
            ) {
                const mode = url.pathname.endsWith('/dub') ? 'dub' : 'sub';
                return response(
                    `<title>File ${mode === 'dub' ? '13454' : '13461'} - MegaPlay</title>`,
                );
            }
            if (
                url.hostname === 'megaplay.buzz' &&
                url.pathname === '/stream/getSources'
            ) {
                const mode =
                    url.searchParams.get('id') === '13454' ? 'dub' : 'sub';
                return response({
                    sources: {
                        file: `https://megap.kotocdn.site/${mode}/master.m3u8`,
                    },
                    tracks: [
                        {
                            kind: 'captions',
                            label: 'English',
                            file: `https://cc.lostproject.club/${mode}.vtt`,
                        },
                    ],
                });
            }
            throw new Error(`Unexpected request: ${url}`);
        }) as unknown as typeof fetch;

        const streams = await anikotoProvider.getStreams(
            anime,
            { id: '1', number: 1 },
            ['sub', 'dub'],
        );

        expect(streams).toEqual({
            sub: [
                {
                    url: 'https://megap.kotocdn.site/sub/master.m3u8',
                    quality: null,
                    audioDelay: 0,
                    subtitleUrl: 'https://cc.lostproject.club/sub.vtt',
                },
            ],
            dub: [
                {
                    url: 'https://megap.kotocdn.site/dub/master.m3u8',
                    quality: null,
                    audioDelay: 0,
                    subtitleUrl: null,
                },
            ],
        });
    });

    const liveTest = process.env.LIVE_ANIKOTO === '1' ? test : test.skip;

    liveTest(
        'resolves live sub and dub manifests for a representative episode',
        async () => {
            const episodes = await anikotoProvider.getEpisodes(anime);
            const first = episodes.find(
                (episode) =>
                    episode.number === 1 &&
                    episode.audio.includes('sub') &&
                    episode.audio.includes('dub'),
            );
            expect(first).toBeDefined();

            const streams = await anikotoProvider.getStreams(anime, first!, [
                'sub',
                'dub',
            ]);

            for (const mode of ['sub', 'dub'] as const) {
                const stream = streams[mode]?.[0];
                expect(stream).toBeDefined();
                const manifest = await nativeFetch(stream!.url, {
                    headers: {
                        Referer: `${megaplayOrigin}/`,
                        'User-Agent': liveUserAgent,
                    },
                    signal: AbortSignal.timeout(15_000),
                });
                expect(manifest.ok).toBe(true);
                expect(await manifest.text()).toStartWith('#EXTM3U');
            }
        },
        60_000,
    );
});

const megaplayOrigin = 'https://megaplay.buzz';
const liveUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';
