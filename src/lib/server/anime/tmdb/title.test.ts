import { describe, expect, test } from 'bun:test';

import {
    candidateScore,
    normalizeTitle,
    releaseSequence,
    seriesTitle,
} from './title';
import type { AniListAnime } from './types';

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
        expect(
            seriesTitle(
                'From Old Country Bumpkin to Master Swordsman II',
            ),
        ).toBe('from old country bumpkin to master swordsman');
        expect(seriesTitle('ラブライブ！スーパースター!! 3期')).toBe(
            'ラフライフ スーハースター',
        );
    });

    test('matches stylized spacing differences for a later season', () => {
        expect(
            candidateScore(
                {
                    id: 106055,
                    mediaType: 'tv',
                    name: 'LoveLive! Superstar!!',
                    originalName: 'ラブライブ！スーパースター!!',
                    date: '2021-07-11',
                    popularity: 9,
                },
                {
                    title: {
                        english: 'Love Live! Superstar!! Season 3',
                        romaji: 'Love Live! Superstar!! 3rd Season',
                        native: 'ラブライブ！スーパースター!! 3期',
                    },
                    startDate: {
                        year: 2024,
                        month: 10,
                        day: 6,
                    },
                    seasonYear: 2024,
                } as AniListAnime,
            ),
        ).toBeGreaterThanOrEqual(85);
    });

    test('matches a Roman-numeral sequel to its aggregate series', () => {
        const anime = {
            title: {
                english:
                    'From Old Country Bumpkin to Master Swordsman II',
                romaji: 'Katainaka no Ossan, Kensei ni Naru II',
                native: '片田舎のおっさん、剣聖になるII',
            },
            startDate: {
                year: 2026,
                month: 7,
                day: 8,
            },
            seasonYear: 2026,
        } as AniListAnime;

        expect(releaseSequence(anime)).toBe(2);
        expect(
            candidateScore(
                {
                    id: 260823,
                    mediaType: 'tv',
                    name: 'From Old Country Bumpkin to Master Swordsman',
                    originalName: '片田舎のおっさん、剣聖になる',
                    date: '2025-04-05',
                    popularity: 29.2599,
                },
                anime,
            ),
        ).toBeGreaterThanOrEqual(85);
    });
});
