import { describe, expect, test } from 'bun:test';

import {
    preferredTvReleaseCandidate,
    tvReleaseMatchesWindow,
    relatedSpecialMappingIsBetter,
    specialEpisodeEvidenceScore,
    type SpecialEpisodeEvidence,
} from './mapping-evidence';
import type { Candidate } from './types';
import type { AniListAnime } from '../anilist/types';

const anime = {
    duration: 24,
    endDate: { year: 2023, month: 11, day: 1 },
    episodes: 3,
    format: 'OVA',
    relations: {
        edges: [
            {
                node: {
                    type: 'ANIME',
                    title: {
                        english: 'That Time I Got Reincarnated as a Slime',
                        romaji: 'Tensei Shitara Slime Datta Ken',
                    },
                },
            },
        ],
    },
    startDate: { year: 2023, month: 11, day: 1 },
    title: {
        english: 'That Time I Got Reincarnated as a Slime: Visions of Coleus',
        romaji: 'Tensei Shitara Slime Datta Ken: Coleus no Yume',
    },
} as AniListAnime;

function episode(
    seasonNumber: number,
    name: string,
    airDate: string,
    complete: boolean
): SpecialEpisodeEvidence {
    return {
        airDate,
        name,
        overview: complete ? `${name} synopsis` : '',
        runtime: 24,
        seasonNumber,
        stillPath: complete ? '/still.jpg' : null,
    };
}

describe('TMDB special-release mapping evidence', () => {
    test('prefers canonical parent specials over a stale duplicate series', () => {
        const duplicate = specialEpisodeEvidenceScore(
            anime,
            ['Episode 1', 'Episode 2', 'Episode 3'].map((name) =>
                episode(1, name, '2022-11-02', false)
            )
        );
        const incompleteDuplicate = specialEpisodeEvidenceScore(
            anime,
            ['Episode 1', 'Episode 2', 'Episode 3'].map((name) =>
                episode(1, name, '2023-11-01', false)
            )
        );
        const parent = specialEpisodeEvidenceScore(
            anime,
            [
                'Visions of Coleus: To Coleus',
                'Visions of Coleus: Great Phantom Thief Satoru',
                'Visions of Coleus: Purple and Roses',
            ].map((name) => episode(0, name, '2023-11-01', true))
        );

        expect(duplicate).toBe(0);
        expect(parent).toBeGreaterThanOrEqual(280);
        expect(relatedSpecialMappingIsBetter(duplicate, parent)).toBeTrue();
        expect(relatedSpecialMappingIsBetter(incompleteDuplicate, parent)).toBeTrue();
    });

    test('keeps an equally well-supported standalone series', () => {
        const direct = specialEpisodeEvidenceScore(
            anime,
            [
                'Visions of Coleus: To Coleus',
                'Visions of Coleus: Great Phantom Thief Satoru',
                'Visions of Coleus: Purple and Roses',
            ].map((name) => episode(1, name, '2023-11-01', true))
        );
        const related = specialEpisodeEvidenceScore(
            anime,
            [
                'Visions of Coleus: To Coleus',
                'Visions of Coleus: Great Phantom Thief Satoru',
                'Visions of Coleus: Purple and Roses',
            ].map((name) => episode(0, name, '2023-11-01', true))
        );

        expect(relatedSpecialMappingIsBetter(direct, related)).toBeFalse();
    });
});

describe('TMDB TV release mapping evidence', () => {
    const santaClaus = {
        episodes: 13,
        format: 'TV',
        startDate: { year: 2025, month: 7, day: 5 },
        title: {
            english: 'Rascal Does Not Dream of Santa Claus',
            romaji: 'Seishun Buta Yarou wa Santa Claus no Yume wo Minai',
            native: '青春ブタ野郎はサンタクロースの夢を見ない',
        },
    } as AniListAnime;
    const duplicate: Candidate = {
        id: 329907,
        mediaType: 'tv',
        name: 'Rascal Does Not Dream of Santa Claus',
        originalName: 'Rascal Does Not Dream of Santa Claus',
        date: '2025-07-05',
        popularity: 0.5539,
    };
    const aggregate: Candidate = {
        id: 82739,
        mediaType: 'tv',
        name: 'Rascal Does Not Dream of Bunny Girl Senpai',
        originalName: '青春ブタ野郎はバニーガール先輩の夢を見ない',
        date: '2018-10-04',
        popularity: 25.8087,
    };

    test('prefers a complete aggregate season over an exact-title duplicate shell', () => {
        expect(
            preferredTvReleaseCandidate(santaClaus, duplicate, [
                {
                    candidate: duplicate,
                    seasons: [
                        {
                            airDate: '2025-07-05',
                            episodeCount: 1,
                            name: 'Season 1',
                            seasonNumber: 1,
                        },
                    ],
                },
                {
                    candidate: aggregate,
                    seasons: [
                        {
                            airDate: '2018-10-04',
                            episodeCount: 13,
                            name: 'Rascal Does Not Dream of Bunny Girl Senpai',
                            seasonNumber: 1,
                        },
                        {
                            airDate: '2025-07-05',
                            episodeCount: 13,
                            name: 'Rascal Does Not Dream of Santa Claus',
                            seasonNumber: 2,
                        },
                    ],
                },
            ]).id
        ).toBe(82739);
    });

    test('keeps a complete standalone series when aggregate evidence is not stronger', () => {
        expect(
            preferredTvReleaseCandidate(santaClaus, duplicate, [
                {
                    candidate: duplicate,
                    seasons: [
                        {
                            airDate: '2025-07-05',
                            episodeCount: 13,
                            name: 'Rascal Does Not Dream of Santa Claus',
                            seasonNumber: 1,
                        },
                    ],
                },
                {
                    candidate: aggregate,
                    seasons: [
                        {
                            airDate: '2025-07-05',
                            episodeCount: 13,
                            name: 'Rascal Does Not Dream of Santa Claus',
                            seasonNumber: 2,
                        },
                    ],
                },
            ]).id
        ).toBe(329907);
    });

    test('prefers a metadata-rich aggregate release window over a complete duplicate shell', () => {
        const frieren = {
            episodes: 10,
            format: 'TV',
            startDate: { year: 2026, month: 1, day: 16 },
            endDate: { year: 2026, month: 3, day: 27 },
            title: {
                english: 'Frieren: Beyond Journey’s End Season 2',
                romaji: 'Sousou no Frieren 2nd Season',
            },
        } as AniListAnime;
        const shell: Candidate = {
            id: 327813,
            mediaType: 'tv',
            name: 'Frieren: Beyond Journey’s End Season 2',
            originalName: '葬送のフリーレン',
            date: null,
            popularity: 2,
        };
        const frierenAggregate: Candidate = {
            id: 209867,
            mediaType: 'tv',
            name: "Frieren: Beyond Journey's End",
            originalName: '葬送のフリーレン',
            date: '2023-09-29',
            popularity: 80,
        };

        expect(
            preferredTvReleaseCandidate(frieren, shell, [
                {
                    candidate: shell,
                    seasons: [
                        {
                            airDate: '2026-01-16',
                            episodeCount: 10,
                            metadataCount: 0,
                            name: 'Season 2',
                            releaseAirDate: '2026-01-16',
                            releaseEpisodeCount: 10,
                            seasonNumber: 2,
                        },
                    ],
                },
                {
                    candidate: frierenAggregate,
                    seasons: [
                        {
                            airDate: '2023-09-29',
                            episodeCount: 38,
                            metadataCount: 10,
                            name: 'Season 1',
                            releaseAirDate: '2026-01-16',
                            releaseEpisodeCount: 10,
                            seasonNumber: 1,
                        },
                    ],
                },
            ]).id
        ).toBe(209867);
    });

    test('recognizes a parent series whose seasons cover one anime release', () => {
        const diamondAndPearl = {
            episodes: 191,
            format: 'TV',
            startDate: { year: 2006, month: 9, day: 28 },
            endDate: { year: 2010, month: 9, day: 9 },
        } as AniListAnime;

        expect(
            tvReleaseMatchesWindow(diamondAndPearl, [
                {
                    airDate: '2006-09-28',
                    episodeCount: 52,
                    releaseAirDate: '2006-09-28',
                    releaseEpisodeCount: 52,
                    seasonNumber: 10,
                    name: 'Diamond and Pearl',
                },
                {
                    airDate: '2007-11-08',
                    episodeCount: 52,
                    releaseAirDate: '2007-11-08',
                    releaseEpisodeCount: 52,
                    seasonNumber: 11,
                    name: 'Diamond and Pearl: Battle Dimension',
                },
                {
                    airDate: '2008-12-04',
                    episodeCount: 53,
                    releaseAirDate: '2008-12-04',
                    releaseEpisodeCount: 53,
                    seasonNumber: 12,
                    name: 'Diamond and Pearl: Galactic Battles',
                },
                {
                    airDate: '2010-01-07',
                    episodeCount: 34,
                    releaseAirDate: '2010-01-07',
                    releaseEpisodeCount: 34,
                    seasonNumber: 13,
                    name: 'Diamond and Pearl: Sinnoh League Victors',
                },
            ])
        ).toBeTrue();
    });
});
