import { describe, expect, test } from 'bun:test';

import { candidateScore, normalizeTitle, releaseSequence, seriesTitle } from './title';
import type { AniListAnime } from '../anilist/types';

describe('TMDB title matching', () => {
    test('normalizes punctuation and diacritics', () => {
        expect(normalizeTitle('Pokémon: The Movie')).toBe('pokemon the movie');
    });

    test('reduces season-qualified titles to the series name', () => {
        expect(seriesTitle('Attack on Titan Final Season')).toBe('attack on titan');
        expect(seriesTitle('Bleach: Thousand-Year Blood War Part 2')).toBe(
            'bleach thousand year blood war'
        );
        expect(seriesTitle('From Old Country Bumpkin to Master Swordsman II')).toBe(
            'from old country bumpkin to master swordsman'
        );
        expect(seriesTitle('ラブライブ！スーパースター!! 3期')).toBe('ラフライフ スーハースター');
    });

    test('matches stylized spacing differences for a later season', () => {
        expect(
            candidateScore(
                // SAFETY: This partial AniList fixture contains the fields used by candidateScore.
                {
                    id: 106055,
                    mediaType: 'tv',
                    name: 'LoveLive! Superstar!!',
                    originalName: 'ラブライブ！スーパースター!!',
                    date: '2021-07-11',
                    popularity: 9,
                },
                // SAFETY: This partial AniList fixture contains the fields used by candidateScore.
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
                } as AniListAnime
            )
        ).toBeGreaterThanOrEqual(85);
    });

    test('matches a Roman-numeral sequel to its aggregate series', () => {
        // SAFETY: This partial AniList fixture contains the fields used by title matching.
        const anime = {
            title: {
                english: 'From Old Country Bumpkin to Master Swordsman II',
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
                // SAFETY: This partial AniList fixture contains the fields used by candidateScore.
                {
                    id: 260823,
                    mediaType: 'tv',
                    name: 'From Old Country Bumpkin to Master Swordsman',
                    originalName: '片田舎のおっさん、剣聖になる',
                    date: '2025-04-05',
                    popularity: 29.2599,
                },
                anime
            )
        ).toBeGreaterThanOrEqual(85);
    });

    test('matches a named story arc through its adaptation title', () => {
        expect(
            candidateScore(
                {
                    id: 85937,
                    mediaType: 'tv',
                    name: 'Demon Slayer: Kimetsu no Yaiba',
                    originalName: '鬼滅の刃',
                    date: '2019-04-06',
                    popularity: 18.3868,
                },
                // SAFETY: This partial AniList fixture contains the fields used by candidateScore.
                {
                    title: {
                        english: 'Demon Slayer: Kimetsu no Yaiba Hashira Training Arc',
                        romaji: 'Kimetsu no Yaiba: Hashira Geiko-hen',
                        native: '鬼滅の刃 柱稽古編',
                    },
                    startDate: {
                        year: 2024,
                        month: 5,
                        day: 12,
                    },
                    seasonYear: 2024,
                    relations: {
                        edges: [
                            {
                                relationType: 'ADAPTATION',
                                node: {
                                    id: 87216,
                                    type: 'MANGA',
                                    title: {
                                        english: 'Demon Slayer: Kimetsu no Yaiba',
                                        romaji: 'Kimetsu no Yaiba',
                                        native: '鬼滅の刃',
                                    },
                                },
                            },
                        ],
                    },
                } as AniListAnime
            )
        ).toBeGreaterThanOrEqual(85);
    });
});
