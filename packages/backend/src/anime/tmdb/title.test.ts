import { describe, expect, test } from 'bun:test';

import {
    alternateCandidateIsBetter,
    candidateMatchesPrimaryTitle,
    candidateScore,
    normalizeTitle,
    releaseSequence,
    seriesTitle,
} from './title';
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

    test('removes an AniList TV disambiguator from searchable titles', () => {
        const anime = {
            format: 'TV',
            title: {
                english: "JoJo's Bizarre Adventure (TV)",
                romaji: 'JoJo no Kimyou na Bouken (TV)',
                native: 'ジョジョの奇妙な冒険 (TV)',
            },
            startDate: {
                year: 2012,
                month: 10,
                day: 6,
            },
        } as AniListAnime;

        expect(seriesTitle("JoJo's Bizarre Adventure (TV)")).toBe('jojo s bizarre adventure');
        expect(
            candidateScore(
                {
                    id: 45790,
                    mediaType: 'tv',
                    name: "JoJo's Bizarre Adventure",
                    originalName: 'ジョジョの奇妙な冒険',
                    date: '2012-10-06',
                    popularity: 100,
                },
                anime
            )
        ).toBeGreaterThanOrEqual(85);
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
                } as AniListAnime
            )
        ).toBeGreaterThanOrEqual(85);
    });

    test('matches a Roman-numeral sequel to its aggregate series', () => {
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

    test('prefers a qualified primary series over an exact adaptation title', () => {
        const anime = {
            title: {
                english: 'Dragon Ball Z Kai: The Final Chapters',
                romaji: 'Dragon Ball Kai (2014)',
                native: 'ドラゴンボール改 (2014)',
            },
            startDate: {
                year: 2014,
                month: 4,
                day: 6,
            },
            relations: {
                edges: [
                    {
                        relationType: 'ADAPTATION',
                        node: {
                            type: 'MANGA',
                            title: {
                                english: 'Dragon Ball',
                                romaji: 'Dragon Ball',
                                native: 'ドラゴンボール',
                            },
                        },
                    },
                ],
            },
        } as AniListAnime;
        const aggregate = candidateScore(
            {
                id: 61709,
                mediaType: 'tv',
                name: 'Dragon Ball Z Kai',
                originalName: 'ドラゴンボール改「カイ」',
                date: '2009-04-05',
                popularity: 15,
            },
            anime
        );
        const adaptation = candidateScore(
            {
                id: 12609,
                mediaType: 'tv',
                name: 'Dragon Ball',
                originalName: 'ドラゴンボール',
                date: '1986-02-26',
                popularity: 50,
            },
            anime
        );

        expect(seriesTitle('Dragon Ball Z Kai: The Final Chapters')).toBe('dragon ball z kai');
        expect(aggregate).toBeGreaterThan(adaptation);
        expect(aggregate).toBeGreaterThanOrEqual(85);
    });

    test('distinguishes an exact release title from its adaptation alias', () => {
        const anime = {
            format: 'TV',
            startDate: { year: 2023, month: 4, day: 1 },
            title: {
                english: 'Kaguya-sama: Love is War -The First Kiss That Never Ends-',
                romaji: 'Kaguya-sama wa Kokurasetai: First Kiss wa Owaranai',
                native: 'かぐや様は告らせたい -ファーストキッスは終わらない-',
            },
            relations: {
                edges: [
                    {
                        relationType: 'ADAPTATION',
                        node: {
                            type: 'MANGA',
                            title: { english: 'Kaguya-sama: Love is War' },
                        },
                    },
                ],
            },
        } as AniListAnime;
        const movie = {
            id: 997317,
            mediaType: 'movie' as const,
            name: 'Kaguya-sama: Love Is War -The First Kiss That Never Ends-',
            originalName: 'かぐや様は告らせたい-ファーストキッスは終わらない-',
            date: '2022-12-17',
            popularity: 20,
        };
        const parentSeries = {
            id: 83121,
            mediaType: 'tv' as const,
            name: 'Kaguya-sama: Love Is War',
            originalName: 'かぐや様は告らせたい～天才たちの恋愛頭脳戦～',
            date: '2019-01-12',
            popularity: 80,
        };

        expect(candidateMatchesPrimaryTitle(movie, anime)).toBeTrue();
        expect(candidateMatchesPrimaryTitle(parentSeries, anime)).toBeFalse();
        expect(alternateCandidateIsBetter(anime, parentSeries, movie)).toBeTrue();
        expect(
            alternateCandidateIsBetter(anime, parentSeries, {
                ...movie,
                date: '1980-01-01',
            })
        ).toBeFalse();
    });
});
