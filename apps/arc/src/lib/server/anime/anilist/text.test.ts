import { describe, expect, test } from 'bun:test';

import type { AniListAnime } from './types';
import { animeTitles } from './text';

describe('animeTitles', () => {
    test('preserves source priority while removing blank and duplicate titles', () => {
        // SAFETY: This partial AniList fixture contains the title fields used by text formatting.
        const anime = {
            title: {
                english: 'Frieren: Beyond Journey’s End',
                romaji: 'Sousou no Frieren',
                native: '葬送のフリーレン',
            },
            synonyms: ['Sousou no Frieren', ' ', 'Frieren at the Funeral'],
        } as AniListAnime;

        expect(animeTitles(anime)).toEqual([
            'Frieren: Beyond Journey’s End',
            'Sousou no Frieren',
            '葬送のフリーレン',
            'Frieren at the Funeral',
        ]);
    });
});
