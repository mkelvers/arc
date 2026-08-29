import { describe, expect, test } from 'bun:test';

import type { ProviderEpisode } from '../providers/types';
import {
    releaseEpisodeGroup,
    releaseWindowEpisodeGroup,
    type EpisodeGroupBlock,
} from './episode-groups';
import type { AniListAnime } from '../anilist/types';

function anime(episodes: number | null, start: [number, number, number]) {
    return {
        episodes,
        startDate: {
            year: start[0],
            month: start[1],
            day: start[2],
        },
    } as AniListAnime;
}

function source(titles: string[]): ProviderEpisode[] {
    return titles.map((title, index) => ({
        id: String(index + 1),
        number: index + 1,
        title,
        audio: ['sub'],
    }));
}

function block(
    firstEpisode: number,
    count: number,
    start: [number, number, number],
    titles: string[] = []
): EpisodeGroupBlock {
    return {
        episodes: Array.from({ length: count }, (_, index) => {
            const number = firstEpisode + index;
            const date = new Date(Date.UTC(start[0], start[1] - 1, start[2] + index * 7))
                .toISOString()
                .slice(0, 10);

            return {
                order: index,
                seasonNumber: 1,
                episodeNumber: number,
                title: titles[index] ?? `Episode ${number}`,
                rawAirDate: date,
                airDate: date,
                overview: `Episode ${number} overview`,
                imageUrl: `/episode-${number}.jpg`,
                runtime: 24,
            };
        }),
        order: firstEpisode === 1 ? 1 : 2,
    };
}

describe('TMDB episode groups', () => {
    test('combines TMDB seasons that exactly cover one AniList release window', () => {
        const release = {
            ...anime(4, [2009, 4, 5]),
            endDate: { year: 2009, month: 4, day: 26 },
        } as AniListAnime;
        const candidates = [
            ...block(1, 2, [2009, 4, 5]).episodes,
            ...block(1, 2, [2009, 4, 19]).episodes.map((episode) => ({
                ...episode,
                seasonNumber: 2,
            })),
            ...block(1, 2, [2014, 4, 6]).episodes.map((episode) => ({
                ...episode,
                seasonNumber: 3,
            })),
        ];

        expect(
            releaseWindowEpisodeGroup(release, candidates)?.map((episode) => ({
                season: episode.seasonNumber,
                episode: episode.episodeNumber,
                release: episode.releaseEpisodeNumber,
            }))
        ).toEqual([
            { season: 1, episode: 1, release: 1 },
            { season: 1, episode: 2, release: 2 },
            { season: 2, episode: 1, release: 3 },
            { season: 2, episode: 2, release: 4 },
        ]);
    });

    test('maps Re:ZERO release episode 12 to TMDB season 1 episode 78', () => {
        const candidates = Array.from({ length: 19 }, (_, index) => ({
            order: index,
            seasonNumber: 1,
            episodeNumber: 67 + index,
            title: index === 11 ? 'From Now On' : `Episode ${index + 1}`,
            rawAirDate:
                index === 11 ? '2026-08-12' : `2026-04-${String(8 + index).padStart(2, '0')}`,
            airDate: '',
            overview: index === 11 ? 'After waking up without his memories yet again.' : '',
            imageUrl: index === 11 ? '/wCls3YU2fX7Lfy0Cjf3s1H3PnM2.jpg' : null,
            runtime: 24,
        }));
        const selected = releaseEpisodeGroup(
            {
                episodes: 19,
                startDate: { year: 2026, month: 4, day: 8 },
                title: {
                    english: 'Re:ZERO -Starting Life in Another World- Season 4',
                },
            } as AniListAnime,
            source(Array.from({ length: 12 }, (_, index) => `Episode ${index + 1}`)),
            [{ episodes: candidates, name: 'Season 4', order: 1 }]
        );

        expect(selected?.[11]).toMatchObject({
            seasonNumber: 1,
            episodeNumber: 78,
            releaseEpisodeNumber: 12,
            title: 'From Now On',
            rawAirDate: '2026-08-12',
        });
    });

    test('selects a separately released second season from one absolute season', () => {
        const selected = releaseEpisodeGroup(
            anime(13, [2026, 7, 5]),
            source(['Episode 1', 'Episode 2', 'Episode 3', 'Episode 4']),
            [
                block(1, 12, [2026, 1, 11]),
                block(
                    13,
                    13,
                    [2026, 7, 5],
                    [
                        'Christmas Eve',
                        "Dilemma of a Winter's Night",
                        "The Year That's Passed, and the Year to Come",
                        'New School Term',
                    ]
                ),
            ]
        );

        expect(
            selected?.slice(0, 4).map((episode) => ({
                episodeNumber: episode.episodeNumber,
                releaseEpisodeNumber: episode.releaseEpisodeNumber,
                title: episode.title,
            }))
        ).toEqual([
            {
                episodeNumber: 13,
                releaseEpisodeNumber: 1,
                title: 'Christmas Eve',
            },
            {
                episodeNumber: 14,
                releaseEpisodeNumber: 2,
                title: "Dilemma of a Winter's Night",
            },
            {
                episodeNumber: 15,
                releaseEpisodeNumber: 3,
                title: "The Year That's Passed, and the Year to Come",
            },
            {
                episodeNumber: 16,
                releaseEpisodeNumber: 4,
                title: 'New School Term',
            },
        ]);
    });

    test('drops one TMDB special from a release group with the expected regular count', () => {
        const special = {
            ...block(1, 1, [2013, 10, 3]).episodes[0],
            seasonNumber: 0,
            order: 20,
        };
        const selected = releaseEpisodeGroup(
            {
                ...anime(20, [2013, 4, 25]),
                endDate: { year: 2013, month: 9, day: 26 },
            } as AniListAnime,
            source(Array.from({ length: 20 }, () => 'Episode')),
            [
                {
                    episodes: [...block(1, 20, [2013, 4, 25]).episodes, special],
                    name: 'Decolora Adventure',
                    order: 1,
                },
            ]
        );

        expect(selected).toHaveLength(20);
        expect(selected?.[0]).toMatchObject({ rawAirDate: '2013-04-25', seasonNumber: 1 });
        expect(selected?.at(-1)).toMatchObject({ rawAirDate: '2013-09-05', seasonNumber: 1 });
    });

    test('rejects equally supported blocks with different inventories', () => {
        expect(
            releaseEpisodeGroup(anime(2, [2024, 1, 1]), source(['Episode 1', 'Episode 2']), [
                block(1, 2, [2024, 1, 1]),
                block(11, 2, [2024, 1, 1]),
            ])
        ).toBeNull();
    });

    test('rejects a reordered broadcast block whose first episode misses the release start', () => {
        const reordered = block(1, 2, [1996, 2, 7]);
        reordered.episodes = [
            { ...reordered.episodes[1], order: 0 },
            { ...reordered.episodes[0], order: 1 },
        ];

        expect(
            releaseEpisodeGroup(
                anime(2, [1996, 2, 7]),
                source(['A Devastating Wish', 'Pan Blasts Off']),
                [reordered]
            )
        ).toBeNull();
    });

    test('uses an explicit season number when group dates are absent', () => {
        const selected = releaseEpisodeGroup(
            {
                ...anime(2, [2024, 1, 1]),
                title: {
                    english: 'Example Season 2',
                    romaji: 'Example 2nd Season',
                },
            } as AniListAnime,
            source(['Episode 1', 'Episode 2']),
            [
                {
                    ...block(11, 2, [2024, 1, 1]),
                    episodes: block(11, 2, [2024, 1, 1]).episodes.map((episode) => ({
                        ...episode,
                        rawAirDate: '',
                    })),
                    name: 'Season 2',
                    order: 2,
                },
            ]
        );

        expect(selected?.[0]).toMatchObject({
            episodeNumber: 11,
            releaseEpisodeNumber: 1,
        });
    });

    test('does not treat a story arc order as a season number', () => {
        const arc = block(1, 10, [2015, 10, 4]);

        expect(
            releaseEpisodeGroup(
                {
                    ...anime(10, [2016, 10, 8]),
                    title: { english: 'Example Season 3' },
                } as AniListAnime,
                source(['Greetings', 'The Threat of the Left']),
                [
                    {
                        ...arc,
                        name: 'Tokyo Expedition',
                        order: 3,
                    },
                ]
            )
        ).toBeNull();
    });
});
