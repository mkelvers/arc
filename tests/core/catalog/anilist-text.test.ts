import { describe, expect, test } from 'bun:test';

import { animeTitles, mediaTitle, plainText } from '@arc/core';

describe('AniList catalog text', () => {
    test('preserves source priority while removing blank and duplicate titles', () => {
        expect(
            animeTitles({
                title: { english: 'Title', romaji: 'Title', native: '  ' },
                synonyms: ['Alias', 'Alias', null],
            })
        ).toEqual(['Title', 'Alias']);
    });

    test('falls back from blank English titles', () => {
        expect(
            mediaTitle({
                id: 42,
                title: { english: '  ', romaji: 'Romaji title', native: 'Native title' },
            })
        ).toBe('Romaji title');
    });

    test('removes markup and trailing source notes from descriptions', () => {
        expect(plainText('<b>Story</b><br>Continues. Note: internal')).toBe('Story Continues.');
    });
});
