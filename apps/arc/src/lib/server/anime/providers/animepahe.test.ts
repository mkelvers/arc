import { afterEach, describe, expect, mock, test } from 'bun:test';

import type { AniListAnime } from '../anilist/types';

mock.module('$env/dynamic/private', () => ({ env: {} }));
mock.module('./mapping', () => ({
    providerMediaId: async () => null,
    saveProviderMediaId: async () => {},
    verifyProviderMediaId: async () => {},
}));

const { animepaheProvider } = await import('./animepahe');
const nativeFetch = globalThis.fetch;

function animeFixture(fields: {
    id: number;
    idMal: number;
    startDate: { year: number };
    title: { english: string; romaji: string; native: string };
    synonyms: string[];
}) {
    return fields as AniListAnime;
}

function mockFetch(handler: (input: string | URL | Request) => Promise<Response>): typeof fetch {
    return Object.assign(mock(handler), { preconnect: globalThis.fetch.preconnect });
}

afterEach(() => {
    globalThis.fetch = nativeFetch;
});

describe('AnimePahe provider', () => {
    test('preserves explicit filler flags from the episode inventory', async () => {
        globalThis.fetch = mockFetch(async (input) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.searchParams.get('m') === 'search') {
                return Response.json({
                    data: [
                        {
                            id: 2404,
                            title: 'Black Clover',
                            session: 'black-clover',
                            year: 2017,
                        },
                    ],
                });
            }
            if (url.searchParams.get('m') === 'release') {
                return Response.json({
                    current_page: 1,
                    last_page: 1,
                    data: [
                        { episode: 29, session: 'episode-29', filler: 1 },
                        { episode: 30, session: 'episode-30', filler: 0 },
                    ],
                });
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        const anime = animeFixture({
            id: 97940,
            idMal: 34572,
            startDate: { year: 2017 },
            title: {
                english: 'Black Clover',
                romaji: 'Black Clover',
                native: 'ブラッククローバー',
            },
            synonyms: [],
        });

        expect(await animepaheProvider.getEpisodes(anime)).toEqual([
            {
                id: '29',
                number: 29,
                title: '',
                audio: ['sub'],
                type: 'filler',
            },
            {
                id: '30',
                number: 30,
                title: '',
                audio: ['sub'],
                type: undefined,
            },
        ]);
    });
});
