import { describe, expect, test } from 'bun:test';

import {
    animeFormatLabel,
    browseSearchParams,
    metadataLabel,
    parseBrowseFilters,
    type BrowseFilters,
} from '@arc/shared/browse';

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

    test('serializes typed search state without exceeding the URL boundary', () => {
        const filters = parseBrowseFilters(new URLSearchParams());
        expect(filters).not.toBeNull();
        if (!filters) {
            throw new Error('Default browse filters failed to parse');
        }

        const searchParams = browseSearchParams({ ...filters, query: `  ${'a'.repeat(201)}  ` });

        expect(searchParams.get('q')).toBe('a'.repeat(200));
        expect(parseBrowseFilters(searchParams)?.query).toBe('a'.repeat(200));
    });

    test('uses the first value when a query parameter is repeated', () => {
        const filters = parseBrowseFilters(new URLSearchParams('sort=score&sort=unknown'));

        expect(filters?.sort).toBe('score');
    });

    test('accepts catalog subtitle selections', () => {
        const filters = parseBrowseFilters(new URLSearchParams({ audio: 'sub' }));

        expect(filters?.audio).toBe('sub');
    });

    test('formats provider status and type values for display', () => {
        expect(metadataLabel('NOT_YET_RELEASED')).toBe('Not Yet Released');
        expect(animeFormatLabel('TV_SHORT')).toBe('TV Short');
    });
});
