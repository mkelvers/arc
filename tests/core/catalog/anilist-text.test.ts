import { describe, expect, test } from 'bun:test';

import { animeTitles, plainText } from '@arc/core/catalog/anilist-text';

describe('AniList catalog text', () => {
    test('preserves source priority while removing blank and duplicate titles', () => {
        expect(
            animeTitles({
                title: { english: 'Title', romaji: 'Title', native: '  ' },
                synonyms: ['Alias', 'Alias', null],
            })
        ).toEqual(['Title', 'Alias']);
    });

    test('removes markup and trailing source notes from descriptions', () => {
        expect(plainText('<b>Story</b><br>Continues. Note: internal')).toBe('Story Continues.');
    });
});
