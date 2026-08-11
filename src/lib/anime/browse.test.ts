import { describe, expect, test } from 'bun:test';

import { browseSearchParams, parseBrowseFilters, type BrowseFilters } from './browse';

describe('browse filters', () => {
    test('uses safe popularity defaults for a clean URL', () => {
        expect(parseBrowseFilters(new URLSearchParams())).toEqual({
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
        });
    });

    test('round trips non-default filters', () => {
        const filters: BrowseFilters = {
            query: 'Cowboy Bebop',
            safe: false,
            genre: null,
            tag: 'tag-value',
            status: 'FINISHED',
            format: 'TV',
            source: 'MANGA',
            season: 'SPRING',
            year: 1998,
            country: 'JP',
            audio: 'dub',
            sort: 'score',
            order: 'asc',
        };
        const searchParams = browseSearchParams(filters);

        expect(searchParams.toString()).toBe(
            'q=Cowboy+Bebop&sfw=0&tag=tag-value&status=FINISHED&format=TV&source=MANGA&season=SPRING&year=1998&country=JP&audio=dub&sort=score&order=asc'
        );
        expect(parseBrowseFilters(searchParams)).toEqual(filters);
    });

    test.each(['sfw=maybe', 'sort=unknown', 'order=unknown', 'audio=raw', 'year=98'])(
        'rejects invalid filter values in %s',
        (query) => {
            expect(parseBrowseFilters(new URLSearchParams(query))).toBeNull();
        }
    );

    test.each([
        'genre=',
        'tag=',
        'status=',
        'format=',
        'source=',
        'season=',
        'country=',
        'genre=genre-value&tag=tag-value',
        `genre=${'a'.repeat(65)}`,
    ])('rejects malformed metadata filters in %s', (query) => {
        expect(parseBrowseFilters(new URLSearchParams(query))).toBeNull();
    });

    test('rejects oversized searches', () => {
        expect(parseBrowseFilters(new URLSearchParams({ q: 'a'.repeat(201) }))).toBeNull();
    });

    test('formats provider status and type values for display', async () => {
        const { browseEnumLabel, browseFormatLabel } = await import('./browse');

        expect(browseEnumLabel('NOT_YET_RELEASED')).toBe('Not Yet Released');
        expect(browseFormatLabel('TV_SHORT')).toBe('TV Short');
    });
});
