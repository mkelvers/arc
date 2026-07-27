import { describe, expect, test } from 'bun:test';

import { normalizeTitle, seriesTitle } from './title';

describe('TMDB title matching', () => {
    test('normalizes punctuation and diacritics', () => {
        expect(normalizeTitle('Pokémon: The Movie')).toBe(
            'pokemon the movie',
        );
    });

    test('reduces season-qualified titles to the series name', () => {
        expect(seriesTitle('Attack on Titan Final Season')).toBe(
            'attack on titan',
        );
        expect(seriesTitle('Bleach: Thousand-Year Blood War Part 2')).toBe(
            'bleach thousand year blood war',
        );
    });
});
