import { afterEach, describe, expect, mock, test } from 'bun:test';

import type { AniListAnime } from '../anilist/types';

let storedMediaId: string | null = null;

mock.module('./mapping', () => ({
    providerMediaId: async () => storedMediaId,
    saveProviderMediaId: async (_anilistId: number, _provider: string, id: string) => {
        storedMediaId = id;
    },
    verifyProviderMediaId: async () => {},
}));

const { anikotoProvider } = await import('./anikoto');
const nativeFetch = globalThis.fetch;

interface AniListFixture {
    id: number;
    idMal?: number | null;
    episodes?: number | null;
    title: { english?: string | null; romaji?: string | null; native?: string | null };
    synonyms: string[];
}

function animeFixture(fields: AniListFixture): AniListAnime {
    return fields as AniListAnime;
}

function mockFetch(handler: (input: string | URL | Request) => Promise<Response>): typeof fetch {
    return Object.assign(mock(handler), { preconnect: globalThis.fetch.preconnect });
}

const anime = animeFixture({
    id: 154587,
    idMal: 52991,
    title: {
        english: "Frieren: Beyond Journey's End",
        romaji: 'Sousou no Frieren',
        native: '葬送のフリーレン',
    },
    synonyms: [],
});
const slimeSeason = animeFixture({
    id: 108511,
    idMal: 39551,
    episodes: 12,
    title: {
        english: 'That Time I Got Reincarnated as a Slime Season 2',
        romaji: 'Tensei Shitara Slime Datta Ken 2nd Season',
        native: '転生したらスライムだった件 第2期',
    },
    synonyms: [],
});
const slimeSeasonThree = animeFixture({
    id: 156822,
    idMal: 53580,
    episodes: 24,
    title: {
        english: 'That Time I Got Reincarnated as a Slime Season 3',
        romaji: 'Tensei Shitara Slime Datta Ken 3rd Season',
        native: '転生したらスライムだった件 第3期',
    },
    synonyms: [],
});
const reawakening = animeFixture({
    id: 184694,
    idMal: 59841,
    episodes: 1,
    title: {
        english: 'Solo Leveling -ReAwakening-',
        romaji: 'Ore dake Level Up na Ken: ReAwakening',
        native: '俺だけレベルアップな件 -ReAwakening-',
    },
    synonyms: [],
});

function response(value: string | Parameters<typeof JSON.stringify>[0], status = 200) {
    return new Response(value instanceof Object ? JSON.stringify(value) : value, { status });
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
        globalThis.fetch = mockFetch(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
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
            if (url.hostname === 'anikotoapi.site' && url.pathname === '/series/6351') {
                return response(seriesPayload());
            }
            throw new Error(`Unexpected request: ${url}`);
        });

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

    test('resolves independent sub and dub HLS sources with per-mode captions', async () => {
        storedMediaId = '6351';
        globalThis.fetch = mockFetch(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.hostname === 'anikotoapi.site' && url.pathname === '/series/6351') {
                return response(seriesPayload());
            }
            if (url.hostname === 'megaplay.buzz' && url.pathname.startsWith('/stream/s-2/')) {
                const mode = url.pathname.endsWith('/dub') ? 'dub' : 'sub';
                return response(
                    `<title>File ${mode === 'dub' ? '13454' : '13461'} - MegaPlay</title>`
                );
            }
            if (url.hostname === 'megaplay.buzz' && url.pathname === '/stream/getSources') {
                const mode = url.searchParams.get('id') === '13454' ? 'dub' : 'sub';
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
        });

        const streams = await anikotoProvider.getStreams(anime, { id: '1', number: 1 }, [
            'sub',
            'dub',
        ]);

        expect(streams).toEqual({
            sub: [
                {
                    url: 'https://megap.kotocdn.site/sub/master.m3u8',
                    quality: null,
                    subtitleUrl: 'https://cc.lostproject.club/sub.vtt',
                },
            ],
            dub: [
                {
                    url: 'https://megap.kotocdn.site/dub/master.m3u8',
                    quality: null,
                    subtitleUrl: 'https://cc.lostproject.club/dub.vtt',
                },
            ],
        });
    });

    test('resolves HLS from a rotated megap CDN host', async () => {
        storedMediaId = '6351';
        globalThis.fetch = mockFetch(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.hostname === 'anikotoapi.site' && url.pathname === '/series/6351') {
                return response(seriesPayload());
            }
            if (url.hostname === 'megaplay.buzz' && url.pathname.startsWith('/stream/s-2/')) {
                return response(`<title>File 13462 - MegaPlay</title>`);
            }
            if (url.hostname === 'megaplay.buzz' && url.pathname === '/stream/getSources') {
                return response({
                    sources: {
                        file: 'https://megap.shiora.site/jjk/master.m3u8',
                    },
                    tracks: [
                        {
                            kind: 'captions',
                            label: 'English',
                            file: 'https://cc.lostproject.club/jjk.vtt',
                        },
                    ],
                });
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        const streams = await anikotoProvider.getStreams(anime, { id: '1', number: 1 }, ['sub']);

        expect(streams).toEqual({
            sub: [
                {
                    url: 'https://megap.shiora.site/jjk/master.m3u8',
                    quality: null,
                    subtitleUrl: 'https://cc.lostproject.club/jjk.vtt',
                },
            ],
        });
    });

    test('prefers the fullest dub caption track', async () => {
        storedMediaId = '6351';
        globalThis.fetch = mockFetch(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.hostname === 'anikotoapi.site' && url.pathname === '/series/6351') {
                return response(seriesPayload());
            }
            if (url.hostname === 'megaplay.buzz' && url.pathname.startsWith('/stream/s-2/')) {
                return response(`<title>File 13463 - MegaPlay</title>`);
            }
            if (url.hostname === 'megaplay.buzz' && url.pathname === '/stream/getSources') {
                return response({
                    sources: {
                        file: 'https://megap.kotocdn.site/dub/master.m3u8',
                    },
                    tracks: [
                        {
                            kind: 'captions',
                            label: 'English (AI)',
                            file: 'https://cc.lostproject.club/english-ai.vtt',
                            default: true,
                        },
                        {
                            kind: 'captions',
                            label: 'English',
                            file: 'https://cc.lostproject.club/eng-2.vtt',
                        },
                        {
                            kind: 'captions',
                            label: 'English 2',
                            file: 'https://cc.lostproject.club/eng-3.vtt',
                        },
                    ],
                });
            }
            if (url.hostname === 'cc.lostproject.club') {
                const file = url.pathname.split('/').pop() ?? '';
                const cues = new Map([
                    ['english-ai.vtt', 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\na line\n'],
                    ['eng-2.vtt', 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\na title\n'],
                    [
                        'eng-3.vtt',
                        'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nline one\n\n00:00:03.000 --> 00:00:04.000\nline two\n',
                    ],
                ]);
                return response(cues.get(file) ?? 'WEBVTT\n');
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        const streams = await anikotoProvider.getStreams(anime, { id: '1', number: 1 }, ['dub']);

        expect(streams.dub).toEqual([
            {
                url: 'https://megap.kotocdn.site/dub/master.m3u8',
                quality: null,
                subtitleUrl: 'https://cc.lostproject.club/eng-3.vtt',
            },
        ]);
    });

    test('keeps an AI-labeled captions track when it is the only one', async () => {
        storedMediaId = '6351';
        globalThis.fetch = mockFetch(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.hostname === 'anikotoapi.site' && url.pathname === '/series/6351') {
                return response(seriesPayload());
            }
            if (url.hostname === 'megaplay.buzz' && url.pathname.startsWith('/stream/s-2/')) {
                return response(`<title>File 13464 - MegaPlay</title>`);
            }
            if (url.hostname === 'megaplay.buzz' && url.pathname === '/stream/getSources') {
                return response({
                    sources: {
                        file: 'https://megap.kotocdn.site/dub/master.m3u8',
                    },
                    tracks: [
                        {
                            kind: 'captions',
                            label: 'English (AI)',
                            file: 'https://cc.lostproject.club/english-ai.vtt',
                            default: true,
                        },
                    ],
                });
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        const streams = await anikotoProvider.getStreams(anime, { id: '1', number: 1 }, ['dub']);

        expect(streams.dub).toEqual([
            {
                url: 'https://megap.kotocdn.site/dub/master.m3u8',
                quality: null,
                subtitleUrl: 'https://cc.lostproject.club/english-ai.vtt',
            },
        ]);
    });

    test('finds a fractional special stored as a standalone provider release', async () => {
        storedMediaId = '5665';
        globalThis.fetch = mockFetch(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.hostname === 'anikotoapi.site' && url.pathname === '/series/5665') {
                return response({
                    ok: true,
                    data: {
                        anime: {
                            id: 5665,
                            ani_id: 108511,
                            mal_id: '39551',
                            title: 'That Time I Got Reincarnated as a Slime Season 2',
                            alternative: 'Tensei Shitara Slime Datta Ken 2nd Season',
                        },
                        episodes: [
                            {
                                number: 1,
                                title: "Rimuru's Busy Life",
                                episode_embed_id: '51449',
                                embed_url: {
                                    sub: 'https://megaplay.buzz/stream/s-2/51449/sub',
                                },
                            },
                        ],
                    },
                });
            }
            if (url.hostname === 'anikototv.to') {
                return response(`
                    <main class="main">
                        <div class="item">
                            <div class="poster" data-tip="6974"></div>
                            <a
                                class="name"
                                data-jp="Tensei shitara Slime Datta Ken: Kanwa - Hinata Sakaguchi"
                            >
                                That Time I Got Reincarnated as a Slime Special: Digression - Hinata Sakaguchi
                            </a>
                        </div>
                    </main>
                `);
            }
            if (url.hostname === 'anikotoapi.site' && url.pathname === '/series/6974') {
                return response({
                    ok: true,
                    data: {
                        anime: {
                            id: 6974,
                            ani_id: null,
                            mal_id: '45753',
                            title: 'That Time I Got Reincarnated as a Slime Special: Digression - Hinata Sakaguchi',
                            alternative: 'Tensei shitara Slime Datta Ken: Kanwa - Hinata Sakaguchi',
                        },
                        episodes: [
                            {
                                number: 1,
                                title: 'Special',
                                episode_embed_id: '54553',
                                embed_url: {
                                    sub: 'https://megaplay.buzz/stream/s-2/54553/sub',
                                    dub: 'https://megaplay.buzz/stream/s-2/54553/dub',
                                },
                            },
                        ],
                    },
                });
            }
            if (url.hostname === 'megaplay.buzz' && url.pathname.startsWith('/stream/s-2/54553/')) {
                return response(
                    `<title>File ${url.pathname.endsWith('/dub') ? '175614' : '28968'} - MegaPlay</title>`
                );
            }
            if (url.hostname === 'megaplay.buzz' && url.pathname === '/stream/getSources') {
                const mode = url.searchParams.get('id') === '175614' ? 'dub' : 'sub';
                return response({
                    sources: {
                        file: `https://megap.kotocdn.site/hinata/${mode}/master.m3u8`,
                    },
                    tracks: [],
                });
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        const streams = await anikotoProvider.getStreams(
            slimeSeason,
            {
                id: '0.9',
                number: 0.9,
                title: 'Digression: Hinata Sakaguchi',
            },
            ['sub', 'dub']
        );

        expect(streams.sub?.[0]?.url).toBe('https://megap.kotocdn.site/hinata/sub/master.m3u8');
        expect(streams.dub?.[0]?.url).toBe('https://megap.kotocdn.site/hinata/dub/master.m3u8');
        expect(storedMediaId).toBe('5665');
    });

    test('uses the sole provider episode for an exact one-episode movie', async () => {
        storedMediaId = '8323';
        globalThis.fetch = mockFetch(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.hostname === 'anikotoapi.site' && url.pathname === '/series/8323') {
                return response({
                    ok: true,
                    data: {
                        anime: {
                            id: 8323,
                            ani_id: null,
                            mal_id: '59841',
                            title: 'Solo Leveling: ReAwakening',
                            alternative: 'Ore dake Level Up na Ken: ReAwakening',
                        },
                        episodes: [
                            {
                                number: 1,
                                title: 'full',
                                episode_embed_id: '145439',
                                embed_url: {
                                    sub: 'https://megaplay.buzz/stream/s-2/145439/sub',
                                },
                            },
                        ],
                    },
                });
            }
            if (url.hostname === 'megaplay.buzz' && url.pathname === '/stream/s-2/145439/sub') {
                return response('<title>File 220001 - MegaPlay</title>');
            }
            if (url.hostname === 'megaplay.buzz' && url.pathname === '/stream/getSources') {
                return response({
                    sources: {
                        file: 'https://megap.kotocdn.site/reawakening/master.m3u8',
                    },
                    tracks: [],
                });
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        const streams = await anikotoProvider.getStreams(
            reawakening,
            {
                id: '1',
                number: 1,
                title: 'Solo Leveling -ReAwakening-',
            },
            ['sub']
        );

        expect(streams.sub?.[0]?.url).toBe('https://megap.kotocdn.site/reawakening/master.m3u8');
    });

    test('maps fractional episodes by position in a provider specials collection', async () => {
        storedMediaId = '6052';
        globalThis.fetch = mockFetch(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.hostname === 'anikotoapi.site' && url.pathname === '/series/6052') {
                return response({
                    ok: true,
                    data: {
                        anime: {
                            id: 6052,
                            ani_id: 156822,
                            mal_id: '53580',
                            title: 'That Time I Got Reincarnated as a Slime Season 3',
                            alternative: 'Tensei Shitara Slime Datta Ken 3rd Season',
                        },
                        episodes: [
                            {
                                number: 1,
                                title: 'Demons and Strategies',
                                episode_embed_id: '120001',
                                embed_url: {
                                    sub: 'https://megaplay.buzz/stream/s-2/120001/sub',
                                },
                            },
                        ],
                    },
                });
            }
            if (url.hostname === 'anikototv.to') {
                return response(`
                    <main class="main">
                        <div class="item">
                            <div class="poster" data-tip="6158"></div>
                            <a
                                class="name"
                                data-jp="Tensei shitara Slime Datta Ken 3rd Season Specials"
                            >
                                That Time I Got Reincarnated as a Slime Season 03: Specials
                            </a>
                        </div>
                    </main>
                `);
            }
            if (url.hostname === 'anikotoapi.site' && url.pathname === '/series/6158') {
                return response({
                    ok: true,
                    data: {
                        anime: {
                            id: 6158,
                            ani_id: null,
                            mal_id: null,
                            title: 'That Time I Got Reincarnated as a Slime Season 03: Specials',
                            alternative: 'Tensei shitara Slime Datta Ken 3rd Season Specials',
                        },
                        episodes: [
                            {
                                number: 1,
                                title: 'Episode 1',
                                episode_embed_id: '123074',
                                embed_url: {
                                    sub: 'https://megaplay.buzz/stream/s-2/123074/sub',
                                    dub: 'https://megaplay.buzz/stream/s-2/123074/dub',
                                },
                            },
                            {
                                number: 2,
                                title: 'Episode 2',
                                episode_embed_id: '127080',
                                embed_url: {
                                    sub: 'https://megaplay.buzz/stream/s-2/127080/sub',
                                },
                            },
                        ],
                    },
                });
            }
            if (url.hostname === 'megaplay.buzz' && url.pathname === '/stream/s-2/127080/sub') {
                return response('<title>File 230002 - MegaPlay</title>');
            }
            if (url.hostname === 'megaplay.buzz' && url.pathname === '/stream/getSources') {
                return response({
                    sources: {
                        file: 'https://megap.kotocdn.site/luminus/master.m3u8',
                    },
                    tracks: [],
                });
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        const streams = await anikotoProvider.getStreams(
            slimeSeasonThree,
            {
                id: '17.5',
                number: 17.5,
                title: 'Digression: Luminus Memories',
                specialIndex: 2,
                specialCount: 2,
            },
            ['sub']
        );

        expect(streams.sub?.[0]?.url).toBe('https://megap.kotocdn.site/luminus/master.m3u8');
        expect(storedMediaId).toBe('6052');
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
                    episode.audio.includes('dub')
            );
            expect(first).toBeDefined();

            const streams = await anikotoProvider.getStreams(anime, first!, ['sub', 'dub']);

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

                if (stream!.subtitleUrl) {
                    const captions = await nativeFetch(stream!.subtitleUrl, {
                        headers: {
                            Referer: `${megaplayOrigin}/`,
                            'User-Agent': liveUserAgent,
                        },
                        signal: AbortSignal.timeout(15_000),
                    });
                    expect(captions.ok).toBe(true);
                    expect(await captions.text()).toStartWith('WEBVTT');
                }
            }
        },
        60_000
    );
});

const megaplayOrigin = 'https://megaplay.buzz';
const liveUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';
