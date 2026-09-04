import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import type { BrowseFilters } from '@arc/core/catalog/browse-filters';
import type { AnimeCard } from '@arc/core/types';
import { appendCatalogPage, createPaginationGate, fetchCatalogPage } from './catalog-pagination';

afterEach(() => {
    mock.restore();
});

const filters = {
    query: '',
    safe: true,
    genre: null,
    tag: null,
    status: null,
    format: null,
    source: null,
    season: null,
    year: null,
    country: null,
    audio: null,
    sort: 'popularity',
    order: 'desc',
} satisfies BrowseFilters;

const card = {
    id: 1,
    href: '/anime/1',
    link: '/anime/1',
    title: 'Test anime',
    image: 'https://images.example/anime.jpg',
    audioLabel: 'Subtitled',
    score: 80,
    genres: [],
    synopsis: '',
} satisfies AnimeCard;

function response(page: number, hasNextPage = true, anime = [card]) {
    return new Response(JSON.stringify({ anime, hasNextPage, page }), { status: 200 });
}

describe('catalog pagination', () => {
    test('starts one request for an intersecting sentinel and blocks repeats in gated mode', () => {
        const gate = createPaginationGate('gated');

        expect(gate.observe(true)).toBeTrue();
        expect(gate.observe(true)).toBeFalse();
        gate.complete();
        expect(gate.observe(true)).toBeFalse();
    });

    test('requires the sentinel to leave and re-enter before another gated request', () => {
        const gate = createPaginationGate('gated');

        expect(gate.observe(true)).toBeTrue();
        gate.complete();
        expect(gate.observe(false)).toBeFalse();
        expect(gate.observe(true)).toBeTrue();
    });

    test('keeps the existing eager behavior for New', () => {
        const gate = createPaginationGate('eager');

        expect(gate.observe(true)).toBeTrue();
        expect(gate.observe(true)).toBeFalse();
        gate.complete();
        expect(gate.observe(true)).toBeTrue();
    });

    test('retries one failed page request once', async () => {
        const fetchSpy = spyOn(globalThis, 'fetch');
        fetchSpy.mockRejectedValueOnce(new Error('network failure')).mockResolvedValue(response(2));
        const result = await fetchCatalogPage({
            kind: 'popular',
            filters,
            page: 2,
            signal: new AbortController().signal,
        });

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(result.page).toBe(2);
    });

    test('can preserve the eager listing without an automatic retry', async () => {
        const fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network failure'));

        await expect(
            fetchCatalogPage({
                kind: 'new',
                filters,
                page: 2,
                signal: new AbortController().signal,
                retryOnce: false,
            })
        ).rejects.toThrow('network failure');

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test('stops after the second failed attempt', async () => {
        const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('unavailable', { status: 503 })
        );

        await expect(
            fetchCatalogPage({
                kind: 'popular',
                filters,
                page: 2,
                signal: new AbortController().signal,
            })
        ).rejects.toThrow('503');

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test('does not retry an abort', async () => {
        const controller = new AbortController();
        controller.abort();
        const fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(
            new DOMException('aborted', 'AbortError')
        );

        await expect(
            fetchCatalogPage({
                kind: 'popular',
                filters,
                page: 2,
                signal: controller.signal,
            })
        ).rejects.toMatchObject({ name: 'AbortError' });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test('rejects a wrong-page response without advancing the page state', async () => {
        spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(response(1))
            .mockResolvedValueOnce(response(1));
        await expect(
            fetchCatalogPage({
                kind: 'popular',
                filters,
                page: 2,
                signal: new AbortController().signal,
            })
        ).rejects.toThrow('invalid response');

        expect(() =>
            appendCatalogPage([card], 2, {
                anime: [card],
                hasNextPage: true,
                page: 1,
            })
        ).toThrow();
    });

    test('deduplicates appended cards and makes the final page terminal', () => {
        const result = appendCatalogPage([card], 2, {
            anime: [
                card,
                {
                    ...card,
                    id: 2,
                    title: 'Second anime',
                },
            ],
            hasNextPage: false,
            page: 2,
        });

        expect(result.anime).toHaveLength(2);
        expect(result.anime.map(({ id }) => id)).toEqual([1, 2]);
        expect(result.nextPage).toBeNull();
    });
});
