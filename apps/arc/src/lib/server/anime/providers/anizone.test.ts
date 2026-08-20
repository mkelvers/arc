import { afterEach, describe, expect, mock, test } from 'bun:test';

import type { AniListAnime } from '../anilist/types';

let storedSlug: string | null = null;

mock.module('./mapping', () => ({
    providerMediaId: async () => storedSlug,
    saveProviderMediaId: async (_anilistId: number, _provider: string, id: string) => {
        storedSlug = id;
    },
    verifyProviderMediaId: async () => {},
}));

const { anizoneProvider } = await import('./anizone');
const nativeFetch = globalThis.fetch;

interface AniListFixture {
    id: number;
    episodes?: number | null;
    status?: AniListAnime['status'];
    startDate?: { year?: number | null };
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
    id: 101280,
    episodes: 2,
    status: 'FINISHED',
    startDate: { year: 2018 },
    title: {
        english: 'That Time I Got Reincarnated as a Slime',
        romaji: 'Tensei Shitara Slime Datta Ken',
        native: null,
    },
    synonyms: [],
});

function argument(value: Parameters<typeof JSON.stringify>[0]) {
    return JSON.stringify(value).replaceAll('"', '\\u0022');
}

const searchPage = `items: JSON.parse('${argument([
    {
        slug: 'wrong-year',
        title_list: { 1: 'That Time I Got Reincarnated as a Slime' },
        start_year: 2021,
        episode_count: 2,
    },
    {
        slug: 'slime',
        title_list: {
            1: 'That Time I Got Reincarnated as a Slime',
            5: 'Tensei Shitara Slime Datta Ken',
        },
        start_year: 2018,
        episode_count: 2,
    },
])}')`;
const seriesPage = `
    <div x-data="{ epsTitles: JSON.parse('${argument({ 1: 'First Episode' })}') }">
        <a href="https://anizone.to/anime/slime/1">Episode 1</a>
    </div>
    <div x-data="{ epsTitles: JSON.parse('${argument({ 1: 'Second Episode' })}') }">
        <a href="https://anizone.to/anime/slime/2">Episode 2</a>
    </div>
`;

function response(body: string, status = 200) {
    return new Response(body, { status });
}

describe('AniZone provider', () => {
    test('matches the exact title, release year, and finished episode count', async () => {
        globalThis.fetch = mockFetch(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.pathname === '/anime' && url.searchParams.has('search')) {
                return response(searchPage);
            }
            if (url.pathname === '/anime/slime') {
                return response(seriesPage);
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        await expect(anizoneProvider.getEpisodes(anime)).resolves.toEqual([
            { id: '1', number: 1, title: 'First Episode', audio: ['sub'] },
            { id: '2', number: 2, title: 'Second Episode', audio: ['sub'] },
        ]);
        expect(storedSlug).toBe('slime');
    });

    test('returns the HLS source and full English subtitle track', async () => {
        storedSlug = 'slime';
        globalThis.fetch = mockFetch(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.pathname === '/anime/slime') {
                return response(seriesPage);
            }
            if (url.pathname === '/anime/slime/1') {
                return response(
                    `vidstackPlayer(JSON.parse('${argument({
                        src: 'https://video.vid-cdn.xyz/show/master.m3u8',
                        subtitles: [
                            {
                                title: 'English Signs',
                                format: 'ass',
                                language: 'en',
                                forced: 'yes',
                                file: 'https://video.vid-cdn.xyz/show/signs.ass',
                            },
                            {
                                title: 'English',
                                format: 'ass',
                                language: 'en',
                                forced: 'no',
                                file: 'https://video.vid-cdn.xyz/show/dialogue.ass',
                            },
                        ],
                    })}'))`
                );
            }
            if (url.pathname === '/show/master.m3u8') {
                return response(
                    '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Japanese",LANGUAGE="ja",URI="ja.m3u8"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",URI="en.m3u8"'
                );
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        await expect(
            anizoneProvider.getStreams(anime, { id: '1', number: 1 }, ['sub', 'dub'])
        ).resolves.toEqual({
            sub: [
                {
                    url: 'https://video.vid-cdn.xyz/show/master.m3u8',
                    subtitleUrl: 'https://video.vid-cdn.xyz/show/dialogue.ass',
                    quality: null,
                },
            ],
            dub: [
                {
                    url: 'https://video.vid-cdn.xyz/show/master.m3u8',
                    subtitleUrl: null,
                    quality: null,
                },
            ],
        });
    });

    test('does not claim dub availability without an English HLS rendition', async () => {
        storedSlug = 'slime';
        globalThis.fetch = mockFetch(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.pathname === '/anime/slime') {
                return response(seriesPage);
            }
            if (url.pathname === '/anime/slime/1') {
                return response(
                    `vidstackPlayer(JSON.parse('${argument({
                        src: 'https://video.vid-cdn.xyz/show/master.m3u8',
                        subtitles: [],
                    })}'))`
                );
            }
            if (url.pathname === '/show/master.m3u8') {
                return response(
                    '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Japanese",LANGUAGE="ja",URI="ja.m3u8"'
                );
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        await expect(
            anizoneProvider.getStreams(anime, { id: '1', number: 1 }, ['dub'])
        ).resolves.toEqual({});
    });
});

afterEach(() => {
    globalThis.fetch = nativeFetch;
    storedSlug = null;
});
