import { describe, expect, test } from 'bun:test';

import { matchesFranchiseFilter, type FranchiseFilter } from './franchise';

const entries = [
    { anilistId: 1, primary: true, format: 'TV' },
    { anilistId: 2, primary: true, format: 'MOVIE' },
    { anilistId: 3, primary: false, format: 'MOVIE' },
    { anilistId: 4, primary: false, format: 'TV' },
    { anilistId: 5, primary: false, format: 'OVA' },
    { anilistId: 6, primary: false, format: 'SPECIAL' },
    { anilistId: 7, primary: false, format: null },
    { anilistId: 8, primary: false, format: 'MUSIC' },
] as const;

describe('franchise filters', () => {
    test('keeps main entries and narrative movies in Main story', () => {
        expect(
            entries
                .filter((entry) => matchesFranchiseFilter(entry, 'main'))
                .map(({ anilistId }) => anilistId)
        ).toEqual([1, 2]);
    });

    test('keeps every movie available in Movies', () => {
        expect(
            entries
                .filter((entry) => matchesFranchiseFilter(entry, 'movies'))
                .map(({ anilistId }) => anilistId)
        ).toEqual([2, 3]);
    });

    test('does not lose released non-movie side stories', () => {
        const filters: FranchiseFilter[] = ['main', 'movies', 'side-stories'];
        const visible = entries.filter((entry) =>
            filters.some((filter) => matchesFranchiseFilter(entry, filter))
        );

        expect(visible.map(({ anilistId }) => anilistId)).toEqual(
            entries.filter(({ format }) => format !== 'MUSIC').map(({ anilistId }) => anilistId)
        );
    });

    test('does not inject a current side story into Main story context', () => {
        expect(matchesFranchiseFilter(entries[4], 'main')).toBe(false);
        expect(matchesFranchiseFilter(entries[4], 'side-stories')).toBe(true);
    });
});
