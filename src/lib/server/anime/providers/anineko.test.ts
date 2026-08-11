import { afterEach, describe, expect, mock, test } from 'bun:test';

import type { ProviderAnime } from './types';

let storedSlug: string | null = null;

mock.module('./mapping', () => ({
    providerMediaId: async () => storedSlug,
    saveProviderMediaId: async (_anilistId: number, _provider: string, id: string) => {
        storedSlug = id;
    },
    verifyProviderMediaId: async () => {},
}));

const { aninekoProvider } = await import('./anineko');
const nativeFetch = globalThis.fetch;

const anime = {
    id: 113415,
    idMal: 40748,
    episodes: 24,
    startDate: { year: 2020 },
    title: {
        english: 'Jujutsu Kaisen',
        romaji: 'Jujutsu Kaisen',
        native: '呪術廻戦',
    },
    synonyms: [],
} as unknown as ProviderAnime;

function response(value: unknown, status = 200) {
    return new Response(typeof value === 'string' ? value : JSON.stringify(value), { status });
}

function searchPayload() {
    return {
        success: true,
        results: [
            {
                title: 'Jujutsu Kaisen (TV)',
                url: '/watch/jujutsu-kaisen-tv',
            },
            {
                title: 'Jujutsu Kaisen 2nd Season',
                url: '/watch/jujutsu-kaisen-2nd-season',
            },
            {
                title: 'Jujutsu Kaisen 0 Movie',
                url: '/watch/jujutsu-kaisen-0-movie',
            },
        ],
    };
}

function watchPage() {
    return `
        <div class="nv-info-main"><h1>Jujutsu Kaisen (TV)</h1></div>
        <div class="nv-info-alt-title">呪術廻戦</div>
        <div class="nv-info-tags"><span>2020</span></div>
        <div class="nv-info-episode-item">
            <a class="nv-info-episode-main" href="/watch/jujutsu-kaisen-tv/ep-1">
                <span>1</span>
            </a>
            <div class="nv-info-episode-badges">
                <span>SUB</span><span>DUB</span>
            </div>
        </div>
        <div class="nv-info-episode-item">
            <a class="nv-info-episode-main" href="/watch/jujutsu-kaisen-tv/ep-2">
                <span>2</span>
            </a>
            <div class="nv-info-episode-badges">
                <span>SUB</span>
            </div>
        </div>
    `;
}

function episodePage() {
    return `
        <div class="lang-group" data-id="sub">
            <div data-video="https://bibiemb.xyz/v/1"></div>
        </div>
        <div class="lang-group" data-id="dub">
            <div data-video="https://bibiemb.xyz/v/2"></div>
        </div>
    `;
}

function embedPage() {
    return `<script>const src = "https://vibevibe.workers.dev/jjk/master.m3u8";</script>`;
}

describe('AniNeko provider', () => {
    test('matches a title with a (TV) disambiguator and resolves streams', async () => {
        globalThis.fetch = mock(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.hostname === 'anineko.to' && url.pathname === '/ajax/search') {
                return response(searchPayload());
            }
            if (url.hostname === 'anineko.to' && url.pathname === '/watch/jujutsu-kaisen-tv') {
                return response(watchPage());
            }
            if (url.hostname === 'anineko.to' && url.pathname === '/watch/jujutsu-kaisen-tv/ep-1') {
                return response(episodePage());
            }
            if (
                url.hostname === 'bibiemb.xyz' &&
                (url.pathname === '/v/1' || url.pathname === '/v/2')
            ) {
                return response(embedPage());
            }
            throw new Error(`Unexpected request: ${url}`);
        }) as unknown as typeof fetch;

        const episodes = await aninekoProvider.getEpisodes(anime);

        expect(storedSlug).toBe('jujutsu-kaisen-tv');
        expect(episodes).toEqual([
            { id: '1', number: 1, title: '1', audio: ['sub', 'dub'] },
            { id: '2', number: 2, title: '2', audio: ['sub'] },
        ]);

        const streams = await aninekoProvider.getStreams(anime, { id: '1', number: 1 }, [
            'sub',
            'dub',
        ]);

        expect(streams).toEqual({
            sub: [
                {
                    url: 'https://vibevibe.workers.dev/jjk/master.m3u8',
                    quality: null,
                    audioDelay: 0,
                    subtitleUrl: null,
                },
            ],
            dub: [
                {
                    url: 'https://vibevibe.workers.dev/jjk/master.m3u8',
                    quality: null,
                    audioDelay: 0,
                    subtitleUrl: null,
                },
            ],
        });
    });
});

afterEach(() => {
    globalThis.fetch = nativeFetch;
    storedSlug = null;
});
