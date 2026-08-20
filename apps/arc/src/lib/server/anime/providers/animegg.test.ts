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

const { animeggProvider } = await import('./animegg');
const nativeFetch = globalThis.fetch;

interface AniListFixture {
    id: number;
    episodes?: number | null;
    status?: AniListAnime['status'];
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
    title: {
        english: 'That Time I Got Reincarnated as a Slime',
        romaji: 'Tensei Shitara Slime Datta Ken',
        native: null,
    },
    synonyms: [],
});

const searchPage = `
    <a href="/series/wrong-season" class="mse">
        <h2>Tensei Shitara Slime Datta Ken 2nd Season</h2>
        <div>Alt Titles : That Time I Got Reincarnated as a Slime Season 2</div>
    </a>
    <a href="/series/slime" class="mse">
        <h2>Tensei Shitara Slime Datta Ken</h2>
        <div>Alt Titles : That Time I Got Reincarnated as a Slime</div>
    </a>
`;
const seriesPage = `
    <div>
        <a href="/slime-episode-2" class="anm_det_pop"><strong>Slime 2</strong></a>
        <i class="anititle">The Second Episode</i><span class="btn-dubbed">DUB</span>
    </div>
    <div>
        <a href="/slime-episode-1" class="anm_det_pop"><strong>Slime 1</strong></a>
        <i class="anititle">The First Episode</i><span class="btn-subbed">SUB</span>
        <span class="btn-dubbed">DUB</span>
    </div>
`;

function response(body: string, status = 200) {
    return new Response(body, { status });
}

describe('AnimeGG provider', () => {
    test('requires an exact release title and a complete finished inventory', async () => {
        globalThis.fetch = mockFetch(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.pathname === '/search/') {
                return response(searchPage);
            }
            if (url.pathname === '/series/slime') {
                return response(seriesPage);
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        await expect(animeggProvider.getEpisodes(anime)).resolves.toEqual([
            { id: '1', number: 1, title: 'The First Episode', audio: ['sub', 'dub'] },
            { id: '2', number: 2, title: 'The Second Episode', audio: ['dub'] },
        ]);
        expect(storedSlug).toBe('slime');
    });

    test('resolves every direct source for the requested audio mode', async () => {
        storedSlug = 'slime';
        globalThis.fetch = mockFetch(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.pathname === '/series/slime') {
                return response(seriesPage);
            }
            if (url.pathname === '/slime-episode-1') {
                return response(`
                    <a data-toggle="tab" data-id="11" data-version="subbed"></a>
                    <a data-toggle="tab" data-id="12" data-version="dubbed"></a>
                `);
            }
            if (url.pathname === '/embed/11') {
                return response(`
                    <script>var videoSources = [
                        {file: "/play/one.mp4", label: "480p"},
                        {file: "https://www.animegg.org/play/two.mp4", label: "720p"}
                    ];</script>
                `);
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        await expect(
            animeggProvider.getStreams(anime, { id: '1', number: 1 }, ['sub'])
        ).resolves.toEqual({
            sub: [
                {
                    url: 'https://www.animegg.org/play/one.mp4',
                    quality: '480p',
                    subtitleUrl: null,
                },
                {
                    url: 'https://www.animegg.org/play/two.mp4',
                    quality: '720p',
                    subtitleUrl: null,
                },
            ],
        });
    });

    test('does not return a stream from the wrong audio tab', async () => {
        storedSlug = 'slime';
        globalThis.fetch = mockFetch(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.pathname === '/series/slime') {
                return response(seriesPage);
            }
            if (url.pathname === '/slime-episode-1') {
                return response('<a data-toggle="tab" data-id="12" data-version="dubbed"></a>');
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        await expect(
            animeggProvider.getStreams(anime, { id: '1', number: 1 }, ['sub'])
        ).resolves.toEqual({ sub: [] });
    });
});

afterEach(() => {
    globalThis.fetch = nativeFetch;
    storedSlug = null;
});
