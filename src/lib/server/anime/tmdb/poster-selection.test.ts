import { describe, expect, test } from 'bun:test';

import { selectPoster, selectReleaseSeason } from './poster-selection';
import type { AniListAnime } from './types';

function anime(values: Partial<AniListAnime> = {}): AniListAnime {
    return {
        id: 1,
        format: 'TV',
        episodes: 12,
        seasonYear: 2014,
        startDate: { year: 2014, month: 7, day: 4 },
        ...values,
    } as AniListAnime;
}

describe('TMDB release poster selection', () => {
    test('selects the season matching the AniList release date', () => {
        expect(
            selectReleaseSeason(anime(), [
                {
                    air_date: '2015-01-09',
                    episode_count: 12,
                    season_number: 2,
                },
                {
                    air_date: '2014-07-04',
                    episode_count: 12,
                    season_number: 1,
                },
            ])?.season.season_number,
        ).toBe(1);
    });

    test('uses a qualified season number when dates are sparse', () => {
        expect(
            selectReleaseSeason(
                anime({
                    title: {
                        english: 'Example Season 2',
                        romaji: null,
                        native: null,
                    },
                    startDate: null,
                    seasonYear: 2020,
                }),
                [
                    {
                        air_date: '2019-01-01',
                        episode_count: 12,
                        season_number: 1,
                    },
                    {
                        air_date: '2020-01-01',
                        episode_count: 12,
                        season_number: 2,
                    },
                ],
            )?.season.season_number,
        ).toBe(2);
    });

    test('uses the only regular season for an aggregate TMDB series', () => {
        const release = anime({
            episodes: 23,
            seasonYear: 2023,
            startDate: { year: 2023, month: 7, day: 6 },
            title: {
                english: 'JUJUTSU KAISEN Season 2',
                romaji: 'Jujutsu Kaisen 2nd Season',
                native: null,
            },
        });

        expect(
            selectReleaseSeason(release, [
                {
                    air_date: '2020-10-03',
                    episode_count: 59,
                    season_number: 1,
                },
            ])?.season.season_number,
        ).toBe(1);
        expect(
            selectReleaseSeason(release, [
                {
                    air_date: '2020-10-03',
                    episode_count: 59,
                    season_number: 1,
                },
            ])?.aggregate,
        ).toBe(true);
    });

    test('selects a matching season-zero poster for an OVA', () => {
        expect(
            selectReleaseSeason(
                anime({
                    format: 'OVA',
                    episodes: 3,
                    startDate: { year: 2017, month: 12, day: 8 },
                }),
                [
                    {
                        air_date: '2017-12-08',
                        episode_count: 3,
                        season_number: 0,
                    },
                    {
                        air_date: '2013-04-07',
                        episode_count: 25,
                        season_number: 1,
                    },
                ],
            )?.season.season_number,
        ).toBe(0);
    });

    test('does not borrow an unrelated season-zero poster for a special', () => {
        expect(
            selectReleaseSeason(
                anime({
                    format: 'SPECIAL',
                    episodes: 1,
                    startDate: { year: 2025, month: 1, day: 1 },
                }),
                [
                    {
                        air_date: '2018-01-01',
                        episode_count: 8,
                        season_number: 0,
                    },
                ],
            ),
        ).toBeNull();
    });

    test('prefers a high-resolution English poster', () => {
        expect(
            selectPoster([
                {
                    aspectRatio: 2 / 3,
                    filePath: '/small.jpg',
                    height: 1_000,
                    language: 'en',
                    voteAverage: 5,
                    voteCount: 10,
                    width: 680,
                },
                {
                    aspectRatio: 2 / 3,
                    filePath: '/large.jpg',
                    height: 3_000,
                    language: 'en',
                    voteAverage: 4,
                    voteCount: 2,
                    width: 2_000,
                },
                {
                    aspectRatio: 2 / 3,
                    filePath: '/foreign.jpg',
                    height: 3_000,
                    language: 'ja',
                    voteAverage: 9,
                    voteCount: 20,
                    width: 2_000,
                },
            ])?.filePath,
        ).toBe('/large.jpg');
    });

    test('prefers high resolution before language', () => {
        expect(
            selectPoster([
                {
                    aspectRatio: 2 / 3,
                    filePath: '/small-english.jpg',
                    height: 1_000,
                    language: 'en',
                    voteAverage: 9,
                    voteCount: 20,
                    width: 680,
                },
                {
                    aspectRatio: 2 / 3,
                    filePath: '/large-neutral.jpg',
                    height: 3_000,
                    language: null,
                    voteAverage: 5,
                    voteCount: 2,
                    width: 2_000,
                },
            ])?.filePath,
        ).toBe('/large-neutral.jpg');
    });

    test('does not reuse a poster assigned to another release', () => {
        expect(
            selectPoster(
                [
                    {
                        aspectRatio: 2 / 3,
                        filePath: '/first.jpg',
                        height: 3_000,
                        language: 'en',
                        voteAverage: 9,
                        voteCount: 20,
                        width: 2_000,
                    },
                    {
                        aspectRatio: 2 / 3,
                        filePath: '/second.jpg',
                        height: 3_000,
                        language: 'en',
                        voteAverage: 8,
                        voteCount: 10,
                        width: 2_000,
                    },
                ],
                new Set(['/first.jpg']),
            )?.filePath,
        ).toBe('/second.jpg');
    });

    test('returns no TMDB poster when every candidate is assigned', () => {
        expect(
            selectPoster(
                [
                    {
                        aspectRatio: 2 / 3,
                        filePath: '/assigned.jpg',
                        height: 3_000,
                        language: 'en',
                        voteAverage: 9,
                        voteCount: 20,
                        width: 2_000,
                    },
                ],
                new Set(['/assigned.jpg']),
            ),
        ).toBeNull();
    });
});
