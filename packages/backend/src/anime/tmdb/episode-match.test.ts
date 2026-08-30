import { describe, expect, test } from 'bun:test';

import type { ProviderEpisode } from '../providers/types';
import {
    matchBestEpisodeMetadata,
    matchEpisodeMetadata,
    providerReleaseWindow,
} from './episode-match';
import type { AniListAnime } from '../anilist/types';
import type { EpisodeCandidate } from './types';

function anime(
    value: Partial<AniListAnime> & {
        startDate: AniListAnime['startDate'];
        endDate: AniListAnime['endDate'];
    }
) {
    return {
        duration: 24,
        ...value,
    } as AniListAnime;
}

function source(values: Array<[id: string, number: number, title: string]>): ProviderEpisode[] {
    return values.map(([id, number, title]) => ({
        id,
        number,
        title,
        audio: ['sub'],
    }));
}

function candidate(
    seasonNumber: number,
    episodeNumber: number,
    title: string,
    rawAirDate: string,
    runtime = 24
): EpisodeCandidate {
    return {
        seasonNumber,
        episodeNumber,
        title,
        rawAirDate,
        runtime,
        overview: `${title} overview`,
        imageUrl: `/s${seasonNumber}e${episodeNumber}.jpg`,
        airDate: rawAirDate,
    };
}

describe('TMDB episode identity matching', () => {
    test('selects a release window after a related aggregate inventory', () => {
        const episodes = source(
            Array.from({ length: 146 }, (_, index) => [
                String(index + 1),
                index + 1,
                `Episode ${index + 1}`,
            ])
        );
        const window = providerReleaseWindow(
            anime({
                episodes: 11,
                relations: {
                    edges: [
                        {
                            relationType: 'PREQUEL',
                            node: {
                                id: 112153,
                                idMal: 40351,
                                episodes: 136,
                                type: 'ANIME',
                                title: { english: 'Pokémon Journeys', romaji: null, native: null },
                            },
                        },
                    ],
                },
                startDate: { year: 2023, month: 1, day: 13 },
                endDate: { year: 2023, month: 3, day: 24 },
            }),
            episodes
        );

        expect(window.map(({ number }) => number)).toEqual(
            Array.from({ length: 11 }, (_, index) => index + 1)
        );
    });

    test('maps a release-local window to an absolute TMDB season window', () => {
        const episodes = source(
            Array.from({ length: 146 }, (_, index) => [
                String(index + 1),
                index + 1,
                `Episode ${index + 1}`,
            ])
        );
        const release = anime({
            episodes: 11,
            relations: {
                edges: [
                    {
                        relationType: 'PREQUEL',
                        node: {
                            id: 112153,
                            idMal: 40351,
                            episodes: 136,
                            type: 'ANIME',
                            title: { english: 'Pokémon Journeys', romaji: null, native: null },
                        },
                    },
                ],
            },
            startDate: { year: 2023, month: 1, day: 13 },
            endDate: { year: 2023, month: 3, day: 24 },
        });
        const dates = [
            '2023-01-13',
            '2023-01-20',
            '2023-01-27',
            '2023-02-03',
            '2023-02-10',
            '2023-02-17',
            '2023-02-24',
            '2023-03-03',
            '2023-03-10',
            '2023-03-17',
            '2023-03-24',
        ];
        const focused = dates.map((date, index) => ({
            ...candidate(25, 47 + index, `TMDB Episode ${47 + index}`, date),
            releaseEpisodeNumber: index + 1,
        }));
        const metadata = matchBestEpisodeMetadata(
            release,
            providerReleaseWindow(release, episodes),
            focused,
            []
        );

        expect(
            [...metadata.entries()]
                .toSorted(([left], [right]) => Number(left) - Number(right))
                .map(([id, value]) => [id, value.episodeNumber])
        ).toEqual(Array.from({ length: 11 }, (_, index) => [String(index + 136), index + 47]));
    });

    test('maps packaged TV_SHORT episodes to their matching TMDB season', () => {
        const episodes = source([
            ['one', 1, 'Segment One'],
            ['two', 2, 'Segment Two'],
        ]);
        const metadata = matchEpisodeMetadata(
            anime({
                format: 'TV_SHORT',
                startDate: { year: 2016, month: 7, day: 4 },
                endDate: { year: 2016, month: 7, day: 11 },
            }),
            episodes,
            [
                candidate(1, 1, 'Segment One + Segment Two', '2016-07-11'),
                candidate(1, 2, 'Next Package', '2016-07-18'),
                candidate(2, 1, 'Other Season', '2018-01-17'),
                candidate(2, 2, 'Other Season 2', '2018-01-24'),
            ]
        );

        expect(metadata.get('one')?.episodeNumber).toBe(1);
        expect(metadata.get('two')?.episodeNumber).toBe(2);
    });

    test('maps a TV finale special instead of leaking into the next season', () => {
        const episodes = source([
            ...Array.from(
                { length: 12 },
                (_, index) =>
                    [String(index + 1), index + 1, `Regular ${index + 1}`] as [
                        string,
                        number,
                        string,
                    ]
            ),
            ['13', 13, 'Winter Days!'],
        ]);
        const metadata = matchEpisodeMetadata(
            anime({
                episodes: 13,
                startDate: { year: 2009, month: 4, day: 3 },
                endDate: { year: 2009, month: 6, day: 26 },
            }),
            episodes,
            [
                ...Array.from({ length: 12 }, (_, index) =>
                    candidate(
                        1,
                        index + 1,
                        `Regular ${index + 1}`,
                        `2009-${String(4 + Math.floor(index / 4)).padStart(2, '0')}-${String(3 + (index % 4) * 7).padStart(2, '0')}`
                    )
                ),
                candidate(0, 1, 'Winter Days!', '2009-06-26'),
                candidate(2, 1, 'Seniors!', '2010-04-07'),
            ]
        );

        expect(metadata.get('13')).toMatchObject({
            seasonNumber: 0,
            episodeNumber: 1,
            title: 'Winter Days!',
        });
    });

    test('combines a regular season with selected long-form specials', () => {
        const episodes = source([
            ...Array.from(
                { length: 24 },
                (_, index) =>
                    [String(index + 1), index + 1, `Regular ${index + 1}`] as [
                        string,
                        number,
                        string,
                    ]
            ),
            ['25', 25, 'Planning Discussion!'],
            ['26', 26, 'Visit!'],
            ['27', 27, ''],
        ]);
        const regular = Array.from({ length: 24 }, (_, index) =>
            candidate(
                2,
                index + 1,
                `Regular ${index + 1}`,
                new Date(Date.UTC(2010, 3, 7 + index * 7)).toISOString().slice(0, 10)
            )
        );
        const metadata = matchEpisodeMetadata(
            anime({
                episodes: 26,
                startDate: { year: 2010, month: 4, day: 7 },
                endDate: { year: 2010, month: 9, day: 29 },
            }),
            episodes,
            [
                ...regular,
                candidate(0, 13, 'Planning Discussion!', '2010-09-22'),
                candidate(0, 14, 'Visit!', '2010-09-29'),
                candidate(0, 12, 'URA-ON!! - We Want Siblings', '2010-09-15', 3),
                candidate(0, 15, 'URA-ON!! - Childhood Memories', '2010-10-20', 3),
                candidate(0, 21, 'Plan!', '2011-03-16'),
            ]
        );

        expect(['25', '26', '27'].map((id) => metadata.get(id)?.title)).toEqual([
            'Planning Discussion!',
            'Visit!',
            'Plan!',
        ]);
    });

    test('matches a fractional leading episode to season zero', () => {
        const metadata = matchEpisodeMetadata(
            anime({
                episodes: 12,
                startDate: { year: 2021, month: 1, day: 12 },
                endDate: { year: 2021, month: 3, day: 30 },
            }),
            source([
                ['0.9', 0.9, 'Digression: Hinata Sakaguchi'],
                ['1', 1, "Rimuru's Busy Life"],
            ]),
            [
                candidate(0, 7, 'Digression: Hinata Sakaguchi', '2021-01-05'),
                candidate(2, 1, "Rimuru's Busy Life", '2021-01-12'),
            ]
        );

        expect(metadata.get('0.9')).toMatchObject({
            seasonNumber: 0,
            episodeNumber: 7,
        });
        expect(metadata.get('1')).toMatchObject({
            seasonNumber: 2,
            episodeNumber: 1,
        });
    });

    test('uses chronology when a provider repeats the preceding title', () => {
        const metadata = matchEpisodeMetadata(
            anime({
                episodes: 5,
                startDate: { year: 2019, month: 7, day: 9 },
                endDate: { year: 2020, month: 11, day: 27 },
            }),
            source([
                ['1', 1, 'The Tragedy of M?'],
                ['2', 2, 'The Tragedy of M?'],
                ['3', 3, "Rimuru's Glamorous Life as a Teacher, Part 1"],
            ]),
            [
                candidate(0, 2, 'Extra: The Tragedy of M?', '2019-07-09'),
                candidate(0, 3, 'Extra: Hey! Butts!', '2019-12-04'),
                candidate(
                    0,
                    4,
                    "Extra: Rimuru's Glamorous Life as a Teacher, Part 1",
                    '2020-03-27'
                ),
                candidate(2, 17, 'The Eve of Battle', '2021-08-03'),
            ]
        );

        expect(metadata.get('1')?.title).toBe('Extra: The Tragedy of M?');
        expect(metadata.get('2')?.title).toBe('Extra: Hey! Butts!');
    });

    test('uses release dates and runtime for untitled ONA episodes', () => {
        const metadata = matchEpisodeMetadata(
            anime({
                duration: 3,
                episodes: 2,
                startDate: { year: 2022, month: 3, day: 19 },
                endDate: { year: 2022, month: 7, day: 29 },
            }),
            source([
                ['1', 1, ''],
                ['2', 2, ''],
            ]),
            [
                candidate(0, 9, 'Sukuwareru Ramiris - 01', '2022-03-19', 3),
                candidate(0, 10, 'Sukuwareru Ramiris - 02', '2022-07-21', 2),
            ]
        );

        expect(metadata.get('1')?.title).toBe('Sukuwareru Ramiris - 01');
        expect(metadata.get('2')?.title).toBe('Sukuwareru Ramiris - 02');
    });

    test('uses a unique ordinal when provider and TMDB titles are generic', () => {
        const metadata = matchEpisodeMetadata(
            anime({
                episodes: 3,
                startDate: { year: 2026, month: 7, day: 5 },
                endDate: { year: 2026, month: 7, day: 19 },
            }),
            source([
                ['1', 1, 'Episode 1'],
                ['2', 2, 'Episode 2'],
                ['3', 3, 'Episode 3'],
            ]),
            [
                candidate(1, 1, 'A Marriage Just for Show', '2026-07-05'),
                candidate(1, 2, 'Episode 2', '2026-07-12'),
                candidate(1, 3, 'Episode 3', '2026-07-19'),
            ]
        );

        expect(metadata.get('3')).toMatchObject({
            episodeNumber: 3,
            title: 'Episode 3',
        });
    });

    test('uses the release ordinal when the provider uses generic titles', () => {
        const metadata = matchEpisodeMetadata(
            anime({
                episodes: 3,
                startDate: { year: 2026, month: 7, day: 5 },
                endDate: { year: 2026, month: 7, day: 19 },
            }),
            source([
                ['1', 1, 'Episode 1'],
                ['2', 2, 'Episode 2'],
                ['3', 3, 'Episode 3'],
            ]),
            [
                candidate(1, 1, 'A New Beginning', '2026-07-05'),
                candidate(1, 2, 'A Difficult Choice', '2026-07-12'),
                candidate(1, 3, 'The Road Ahead', '2026-07-19'),
            ]
        );

        expect(['1', '2', '3'].map((id) => metadata.get(id)?.title)).toEqual([
            'A New Beginning',
            'A Difficult Choice',
            'The Road Ahead',
        ]);
    });

    test('does not treat the latest available simulcast row as the finale', () => {
        const metadata = matchEpisodeMetadata(
            anime({
                episodes: 13,
                startDate: { year: 2026, month: 7, day: 7 },
                endDate: { year: 2026, month: 9, day: 29 },
            }),
            source(
                Array.from(
                    { length: 4 },
                    (_, index) =>
                        [String(index + 1), index + 1, `Episode ${index + 1}`] as [
                            string,
                            number,
                            string,
                        ]
                )
            ),
            Array.from({ length: 13 }, (_, index) =>
                candidate(
                    1,
                    index + 1,
                    `Episode ${index + 1}`,
                    new Date(Date.UTC(2026, 6, 7 + index * 7)).toISOString().slice(0, 10),
                    0
                )
            )
        );

        expect(metadata.get('4')).toMatchObject({
            seasonNumber: 1,
            episodeNumber: 4,
            title: 'Episode 4',
        });
    });

    test('uses an earlier streaming schedule when TMDB consistently dates the TV broadcast', () => {
        const metadata = matchEpisodeMetadata(
            anime({
                episodes: 12,
                startDate: { year: 2026, month: 7, day: 3 },
                endDate: { year: 2026, month: 9, day: 18 },
                nextAiringEpisode: {
                    episode: 7,
                    airingAt: 1_786_714_200,
                },
            }),
            source(
                Array.from(
                    { length: 6 },
                    (_, index) =>
                        [String(index + 1), index + 1, `Episode ${index + 1}`] as [
                            string,
                            number,
                            string,
                        ]
                )
            ),
            Array.from({ length: 12 }, (_, index) =>
                candidate(
                    1,
                    index + 1,
                    `Episode ${index + 1}`,
                    new Date(Date.UTC(2026, 6, 10 + index * 7)).toISOString().slice(0, 10)
                )
            )
        );

        expect(['1', '2', '3', '4', '5', '6'].map((id) => metadata.get(id)?.airDate)).toEqual([
            '07/03/2026',
            '07/10/2026',
            '07/17/2026',
            '07/24/2026',
            '07/31/2026',
            '08/07/2026',
        ]);
        expect(metadata.get('6')?.rawAirDate).toBe('2026-08-14');
    });

    test('keeps TMDB dates when the release schedule does not confirm the offset', () => {
        const metadata = matchEpisodeMetadata(
            anime({
                episodes: 2,
                startDate: { year: 2026, month: 7, day: 3 },
                endDate: { year: 2026, month: 7, day: 17 },
            }),
            source([
                ['1', 1, 'Episode 1'],
                ['2', 2, 'Episode 2'],
            ]),
            [candidate(1, 1, 'Episode 1', '2026-07-10'), candidate(1, 2, 'Episode 2', '2026-07-17')]
        );

        expect(['1', '2'].map((id) => metadata.get(id)?.airDate)).toEqual([
            '2026-07-10',
            '2026-07-17',
        ]);
    });

    test('keeps an extended finale when its date and ordinal match', () => {
        const episodes = source(
            Array.from(
                { length: 8 },
                (_, index) =>
                    [
                        String(index + 1),
                        index + 1,
                        index === 7 ? 'Hashiras, Assemble' : `Episode ${index + 1}`,
                    ] as [string, number, string]
            )
        );
        const metadata = matchEpisodeMetadata(
            anime({
                duration: 30,
                episodes: 8,
                startDate: { year: 2024, month: 5, day: 12 },
                endDate: { year: 2024, month: 6, day: 30 },
            }),
            episodes,
            [candidate(5, 8, 'The Hashira Unite', '2024-06-30', 41)]
        );

        expect(metadata.get('8')).toMatchObject({
            seasonNumber: 5,
            episodeNumber: 8,
            title: 'The Hashira Unite',
        });
    });

    test('prefers the canonical ordinal over a later global provider number', () => {
        const episodes = source([
            ...Array.from(
                { length: 25 },
                (_, index) =>
                    [
                        String(index + 1),
                        index + 1,
                        index === 9 ? 'Fanatical Methods Like a Demon' : `Regular ${index + 1}`,
                    ] as [string, number, string]
            ),
            ['70', 70, 'Episode 70'],
        ]);
        const available = Array.from({ length: 25 }, (_, index) =>
            candidate(
                1,
                index + 1,
                index === 9 ? 'Demonically Inspired Methods' : `Regular ${index + 1}`,
                new Date(Date.UTC(2016, 3, 4 + index * 7)).toISOString().slice(0, 10)
            )
        );
        const metadata = matchEpisodeMetadata(
            anime({
                episodes: 25,
                startDate: { year: 2016, month: 4, day: 4 },
                endDate: { year: 2016, month: 9, day: 19 },
            }),
            episodes,
            available
        );

        expect(metadata.get('10')).toMatchObject({
            seasonNumber: 1,
            episodeNumber: 10,
        });
        expect(metadata.has('70')).toBeFalse();
    });

    test('uses the release window to disambiguate similar future titles', () => {
        const metadata = matchEpisodeMetadata(
            anime({
                episodes: 24,
                startDate: { year: 2024, month: 4, day: 5 },
                endDate: { year: 2024, month: 9, day: 27 },
            }),
            source([['13', 13, 'The Nations and Invitations']]),
            [
                candidate(3, 13, 'Invitation for All Nations', '2024-06-28'),
                candidate(4, 13, 'Invitation', '2026-04-24'),
            ]
        );

        expect(metadata.get('13')).toMatchObject({
            seasonNumber: 3,
            episodeNumber: 13,
            rawAirDate: '2024-06-28',
        });
    });

    test('rejects exact titles from an earlier cour', () => {
        const staleTitles = [
            'Introductions',
            'Lost',
            'Perspective',
            'Take it Easy',
            'Hunger',
            'Enhancements',
            'Return',
            'Challenger',
        ];
        const releaseTitles = [
            'Rhythm',
            'Found',
            'Broken Heart',
            'Cats vs. Monkeys',
            'Trap',
            'The Ultimate Challengers',
            'Leader',
            'Hero',
        ];
        const metadata = matchEpisodeMetadata(
            anime({
                episodes: 12,
                startDate: { year: 2020, month: 10, day: 3 },
                endDate: { year: 2020, month: 12, day: 19 },
            }),
            source(
                staleTitles.map(
                    (title, index) =>
                        [String(index + 1), index + 1, title] as [string, number, string]
                )
            ),
            [
                ...staleTitles.map((title, index) =>
                    candidate(
                        4,
                        index + 1,
                        title,
                        new Date(Date.UTC(2020, 0, 11 + index * 7)).toISOString().slice(0, 10)
                    )
                ),
                ...releaseTitles.map((title, index) =>
                    candidate(
                        4,
                        index + 14,
                        title,
                        new Date(Date.UTC(2020, 9, 3 + index * 7)).toISOString().slice(0, 10)
                    )
                ),
            ]
        );

        expect(
            staleTitles.map((_, index) => metadata.get(String(index + 1))?.episodeNumber)
        ).toEqual([14, 15, 16, 17, 18, 19, 20, 21]);
    });

    test('keeps an OVA out of a nearby regular season', () => {
        const metadata = matchEpisodeMetadata(
            anime({
                format: 'OVA',
                episodes: 2,
                startDate: { year: 2020, month: 1, day: 10 },
                endDate: { year: 2020, month: 1, day: 10 },
                title: {
                    english: 'HAIKYU!! LAND VS. AIR',
                    romaji: null,
                    native: null,
                },
                synonyms: ['The Path of the Ball'],
            }),
            source([
                ['1', 1, 'Introductions'],
                ['2', 2, 'Lost'],
            ]),
            [
                candidate(4, 1, 'Introductions', '2020-01-11'),
                candidate(4, 2, 'Lost', '2020-01-18'),
                candidate(0, 4, 'Land vs. Air', '2020-01-22'),
                candidate(0, 5, 'The Path of the Ball', '2020-01-22'),
            ]
        );

        expect(['1', '2'].map((id) => metadata.get(id)?.seasonNumber)).toEqual([0, 0]);
        expect(['1', '2'].map((id) => metadata.get(id)?.episodeNumber)).toEqual([4, 5]);
    });

    test('falls back when an episode group covers fewer episodes', () => {
        const release = anime({
            episodes: 3,
            startDate: { year: 2016, month: 10, day: 8 },
            endDate: { year: 2016, month: 10, day: 22 },
        });
        const episodes = source([
            ['1', 1, 'Greetings'],
            ['2', 2, 'The Threat of the Left'],
            ['3', 3, 'Guess-Monster'],
        ]);
        const metadata = matchBestEpisodeMetadata(
            release,
            episodes,
            [
                candidate(2, 1, "Let's Go To Tokyo!!", '2015-10-04'),
                candidate(2, 2, 'Direct Sunlight', '2015-10-11'),
                candidate(2, 3, 'Townsperson B', '2015-10-18'),
            ],
            [
                candidate(3, 1, 'Greetings', '2016-10-08'),
                candidate(3, 2, 'The Threat of the Left', '2016-10-15'),
                candidate(3, 3, 'Guess-Monster', '2016-10-22'),
            ]
        );

        expect([...metadata.values()].map(({ seasonNumber }) => seasonNumber)).toEqual([3, 3, 3]);
    });

    test('keeps a verified episode-group order when provider titles use another edition', () => {
        const episodes = source([
            ['1', 1, 'International Episode Two'],
            ['2', 2, 'International Episode Three'],
            ['3', 3, 'Episode 3'],
        ]);
        const focused = [
            candidate(5, 1, 'International Episode One', '2014-04-06'),
            candidate(0, 7, 'International Episode Two', '2017-01-22'),
            candidate(5, 3, 'International Episode Three', '2014-04-20'),
        ].map((episode, index) => ({ ...episode, releaseEpisodeNumber: index + 1 }));
        const metadata = matchEpisodeMetadata(
            anime({
                episodes: 3,
                startDate: { year: null, month: null, day: null },
                endDate: { year: null, month: null, day: null },
            }),
            episodes,
            focused
        );

        expect(['1', '2', '3'].map((id) => metadata.get(id)?.releaseEpisodeNumber)).toEqual([
            1, 2, 3,
        ]);
    });

    test('maps a focused absolute-order group to generic provider numbering', () => {
        const episodes = source(
            Array.from({ length: 45 }, (_, index) => [
                String(index + 1),
                index + 1,
                `Episode ${index + 1}`,
            ])
        );
        const focused = Array.from({ length: 20 }, (_, index) => ({
            ...candidate(16, 26 + index, `Episode ${26 + index}`, `2013-04-${25 + index}`),
            releaseEpisodeNumber: index + 1,
        }));

        const metadata = matchBestEpisodeMetadata(
            anime({
                episodes: 20,
                startDate: { year: 2013, month: 4, day: 25 },
                endDate: { year: 2013, month: 9, day: 26 },
            }),
            episodes,
            focused,
            []
        );

        expect(metadata.get('26')).toMatchObject({ episodeNumber: 26 });
        expect(metadata.get('45')).toMatchObject({ episodeNumber: 45 });
        expect(metadata).toHaveLength(20);
    });
});
