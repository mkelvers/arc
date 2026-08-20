import { describe, expect, test } from 'bun:test';

import type { AniListAnime } from './anilist/types';
import { getFillerClassifications, mergeFillerClassifications } from './filler';
import type { ProviderEpisode } from './providers/types';

function anime(overrides: Partial<AniListAnime> = {}) {
    return {
        id: 1735,
        idMal: 1735,
        status: 'FINISHED',
        episodes: 500,
        title: {
            english: 'Naruto Shippuden',
            romaji: 'NARUTO: Shippuuden',
            native: 'NARUTO -ナルト- 疾風伝',
        },
        synonyms: [],
        ...overrides,
    } as AniListAnime;
}

function episodes(total: number): ProviderEpisode[] {
    return Array.from({ length: total }, (_, index) => ({
        id: String(index + 1),
        number: index + 1,
        title: `Episode ${index + 1}`,
        audio: ['sub'],
    }));
}

function showPage(total: number, types: Record<number, string>) {
    return `
        <h1>Naruto Shippuden Filler List</h1>
        <table class="EpisodeList"><tbody>
            ${Array.from({ length: total }, (_, index) => {
                const number = index + 1;
                return `<tr>
                    <td class="Number">${number}</td>
                    <td class="Type"><span>${types[number] ?? 'Manga Canon'}</span></td>
                </tr>`;
            }).join('')}
        </tbody></table>
    `;
}

function request(showHtml: string, indexTitle = 'Naruto Shippuden') {
    return async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/shows')) {
            return new Response(
                `<div id="ShowList"><a href="/shows/naruto-shippuden">${indexTitle}</a></div>`,
                { headers: { 'content-type': 'text/html' } }
            );
        }
        if (url.endsWith('/shows/naruto-shippuden')) {
            return new Response(showHtml, { headers: { 'content-type': 'text/html' } });
        }
        throw new Error(`Unexpected request: ${url}`);
    };
}

describe('AnimeFillerList classification', () => {
    test('classifies the full Naruto Shippuden release from one show lookup', async () => {
        const classifications = await getFillerClassifications(
            anime(),
            episodes(500),
            request(
                showPage(500, {
                    1: 'Mixed Canon/Filler',
                    28: 'Filler',
                    29: 'Manga Canon',
                    451: 'Anime Canon',
                })
            )
        );

        expect(classifications.size).toBe(500);
        expect(classifications.get(1)).toBe('mixed');
        expect(classifications.get(28)).toBe('filler');
        expect(classifications.get(29)).toBe('canon');
        expect(classifications.get(451)).toBe('anime-canon');
    });

    test('fails closed when the title is not an exact match', async () => {
        const classifications = await getFillerClassifications(
            anime(),
            episodes(500),
            request(showPage(500, {}), 'Naruto')
        );

        expect(classifications).toEqual(new Map());
    });

    test('fails closed when a finished show has the wrong episode count', async () => {
        const classifications = await getFillerClassifications(
            anime(),
            episodes(500),
            request(showPage(499, {}))
        );

        expect(classifications).toEqual(new Map());
    });

    test('does not perform a title lookup without a MAL identity', async () => {
        let requests = 0;
        const classifications = await getFillerClassifications(
            anime({ idMal: null }),
            episodes(500),
            async () => {
                requests += 1;
                return new Response();
            }
        );

        expect(classifications).toEqual(new Map());
        expect(requests).toBe(0);
    });

    test('keeps dedicated filler above a provider recap marker', () => {
        const providerEpisodes = episodes(30);
        providerEpisodes[28].type = 'recap';

        expect(
            mergeFillerClassifications(providerEpisodes, new Map([[29, 'filler']]))[28].type
        ).toBe('filler');
    });
});
