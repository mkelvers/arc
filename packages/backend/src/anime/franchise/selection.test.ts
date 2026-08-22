import { describe, expect, test } from 'bun:test';

import type { FranchiseSelectionEntry } from './selection';
import { isFranchiseEntryEligible, primaryFranchiseIds } from './selection';

function entry(
    malId: number,
    overrides: Partial<FranchiseSelectionEntry> = {}
): FranchiseSelectionEntry {
    return {
        malId,
        title: `Anime ${malId}`,
        format: 'TV',
        status: 'FINISHED',
        episodes: 12,
        duration: 24,
        popularity: 10_000,
        secondary: false,
        relations: [],
        ...overrides,
    };
}

function relation(type: FranchiseSelectionEntry['relations'][number]['type'], malId: number) {
    return { type, malId };
}

describe('primaryFranchiseIds', () => {
    test('keeps the Slime story chain and narrative movies without short extras', () => {
        const selected = primaryFranchiseIds([
            entry(1, {
                title: 'That Time I Got Reincarnated as a Slime',
                popularity: 450_000,
                relations: [
                    relation('SIDE_STORY', 2),
                    relation('SPIN_OFF', 3),
                    relation('SIDE_STORY', 4),
                    relation('CHARACTER', 5),
                    relation('SEQUEL', 6),
                ],
            }),
            entry(2, {
                title: 'Slime OAD',
                format: 'OVA',
                episodes: 5,
                popularity: 84_000,
                relations: [relation('PARENT', 1)],
            }),
            entry(3, {
                title: 'The Slime Diaries',
                popularity: 98_000,
                relations: [relation('PARENT', 1)],
            }),
            entry(4, {
                title: 'Sukuwareru Ramiris',
                format: 'ONA',
                episodes: 2,
                duration: 3,
                secondary: true,
                relations: [relation('PARENT', 1)],
            }),
            entry(5, {
                title: 'Sunshine in the Slime',
                format: 'ONA',
                episodes: 2,
                duration: 9,
                popularity: 2_500,
                relations: [relation('CHARACTER', 1)],
            }),
            entry(6, {
                title: 'Visions of Coleus',
                format: 'OVA',
                episodes: 3,
                relations: [relation('PREQUEL', 1), relation('SEQUEL', 7)],
            }),
            entry(7, {
                title: 'Season 2',
                relations: [relation('PREQUEL', 6), relation('SEQUEL', 8)],
            }),
            entry(8, {
                title: 'Season 2 Part 2',
                relations: [relation('PREQUEL', 7), relation('SEQUEL', 10), relation('OTHER', 9)],
            }),
            entry(9, {
                title: 'Scarlet Bond',
                format: 'MOVIE',
                episodes: 1,
                duration: 108,
                relations: [relation('PARENT', 8)],
            }),
            entry(10, {
                title: 'Season 3',
                relations: [relation('PREQUEL', 8)],
            }),
        ]);

        expect([...selected].toSorted((a, b) => a - b)).toEqual([1, 7, 8, 10]);
    });

    test('uses Attack on Titan continuity instead of recap and side-story branches', () => {
        const selected = primaryFranchiseIds([
            entry(1, {
                title: 'Attack on Titan',
                popularity: 1_000_000,
                relations: [
                    relation('SEQUEL', 2),
                    relation('SIDE_STORY', 20),
                    relation('ALTERNATIVE', 30),
                ],
            }),
            entry(2, {
                title: 'Attack on Titan Season 2',
                popularity: 700_000,
                relations: [relation('PREQUEL', 1), relation('SEQUEL', 3), relation('SUMMARY', 32)],
            }),
            entry(3, {
                title: 'Attack on Titan Season 3',
                popularity: 670_000,
                relations: [relation('PREQUEL', 2), relation('SEQUEL', 4)],
            }),
            entry(4, {
                title: 'Attack on Titan Final Season',
                popularity: 630_000,
                relations: [relation('PREQUEL', 3), relation('SEQUEL', 5)],
            }),
            entry(5, {
                title: 'Attack on Titan Final Chapters',
                format: 'SPECIAL',
                episodes: 2,
                duration: 60,
                popularity: 240_000,
                relations: [relation('PREQUEL', 4)],
            }),
            entry(20, {
                title: 'Attack on Titan OAD',
                format: 'OVA',
                episodes: 3,
                popularity: 130_000,
                relations: [relation('PARENT', 1)],
            }),
            entry(30, {
                title: 'Recap Movie 1',
                format: 'MOVIE',
                episodes: 1,
                duration: 118,
                popularity: 30_000,
                relations: [relation('ALTERNATIVE', 1), relation('SEQUEL', 31)],
            }),
            entry(31, {
                title: 'Recap Movie 2',
                format: 'MOVIE',
                episodes: 1,
                duration: 120,
                popularity: 31_000,
                relations: [relation('PREQUEL', 30), relation('SEQUEL', 32)],
            }),
            entry(32, {
                title: 'Recap Movie 3',
                format: 'MOVIE',
                episodes: 1,
                duration: 120,
                popularity: 25_000,
                relations: [relation('PREQUEL', 31), relation('PARENT', 2)],
            }),
        ]);

        expect([...selected].toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    });

    test('keeps the Rascal movie bridge and named television continuation', () => {
        const selected = primaryFranchiseIds([
            entry(37450, {
                title: 'Rascal Does Not Dream of Bunny Girl Senpai',
                popularity: 881_987,
                relations: [relation('SEQUEL', 38329)],
            }),
            entry(38329, {
                title: 'Rascal Does Not Dream of a Dreaming Girl',
                format: 'MOVIE',
                episodes: 1,
                duration: 90,
                popularity: 408_638,
                relations: [
                    relation('PREQUEL', 37450),
                    relation('SEQUEL', 53129),
                    relation('ALTERNATIVE', 158943),
                ],
            }),
            entry(53129, {
                title: 'Rascal Does Not Dream of a Sister Venturing Out',
                format: 'MOVIE',
                episodes: 1,
                duration: 73,
                popularity: 112_829,
                relations: [relation('PREQUEL', 38329), relation('SEQUEL', 54870)],
            }),
            entry(54870, {
                title: 'Rascal Does Not Dream of a Knapsack Kid',
                format: 'MOVIE',
                episodes: 1,
                duration: 75,
                popularity: 102_147,
                relations: [relation('PREQUEL', 53129), relation('SEQUEL', 57433)],
            }),
            entry(57433, {
                title: 'Rascal Does Not Dream of Santa Claus',
                episodes: 13,
                popularity: 87_414,
                relations: [relation('PREQUEL', 54870)],
            }),
        ]);

        expect([...selected].toSorted((a, b) => a - b)).toEqual([
            37450, 38329, 53129, 54870, 57433,
        ]);
    });

    test('keeps K-On! Movie as the terminal main-story release', () => {
        const selected = primaryFranchiseIds([
            entry(5680, {
                title: 'K-ON!',
                popularity: 276_811,
                relations: [relation('SEQUEL', 7791)],
            }),
            entry(7791, {
                title: 'K-ON! Season 2',
                episodes: 26,
                popularity: 166_258,
                relations: [relation('PREQUEL', 5680), relation('SIDE_STORY', 9617)],
            }),
            entry(9617, {
                title: 'K-ON!: The Movie',
                format: 'MOVIE',
                episodes: 1,
                duration: 110,
                popularity: 89_191,
                relations: [relation('PARENT', 7791)],
            }),
        ]);

        expect([...selected].toSorted((a, b) => a - b)).toEqual([5680, 7791, 9617]);
    });

    test('keeps an unlinked future season but not unrelated television spin-offs', () => {
        const selected = primaryFranchiseIds([
            entry(1, {
                title: 'Main series',
                popularity: 100_000,
            }),
            entry(2, {
                title: 'Main series Season 4',
                popularity: 1_000,
            }),
            entry(3, {
                title: 'Main series: Junior High',
                popularity: 20_000,
                relations: [relation('PARENT', 1)],
            }),
        ]);

        expect([...selected].toSorted((a, b) => a - b)).toEqual([1, 2]);
    });

    test('keeps a Solo Leveling recap movie out of the main story', () => {
        const selected = primaryFranchiseIds([
            entry(151807, {
                title: 'Solo Leveling',
                popularity: 900_000,
                relations: [relation('SEQUEL', 176496), relation('SUMMARY', 184694)],
            }),
            entry(184694, {
                title: 'Solo Leveling -ReAwakening-',
                format: 'MOVIE',
                episodes: 1,
                duration: 114,
                popularity: 250_000,
                relations: [relation('SEQUEL', 176496), relation('PARENT', 151807)],
            }),
            entry(176496, {
                title: 'Solo Leveling Season 2',
                popularity: 700_000,
                relations: [relation('PREQUEL', 151807), relation('PREQUEL', 184694)],
            }),
        ]);

        expect([...selected].toSorted((a, b) => a - b)).toEqual([151807, 176496]);
    });

    test('keeps a standalone Attack on Titan OVA out of the main story', () => {
        const selected = primaryFranchiseIds([
            entry(16498, {
                title: 'Attack on Titan',
                popularity: 1_000_000,
                relations: [relation('SEQUEL', 25781), relation('SEQUEL', 9910)],
            }),
            entry(25781, {
                title: 'Attack on Titan: No Regrets',
                format: 'OVA',
                episodes: 2,
                duration: 28,
                popularity: 151_964,
                relations: [relation('SEQUEL', 16498)],
            }),
            entry(9910, {
                title: 'Attack on Titan Season 2',
                popularity: 700_000,
                relations: [relation('PREQUEL', 16498)],
            }),
        ]);

        expect([...selected].toSorted((a, b) => a - b)).toEqual([9910, 16498]);
    });

    test('uses a side-story OVA as a continuity bridge without selecting it', () => {
        const selected = primaryFranchiseIds([
            entry(1, {
                title: 'Main series',
                popularity: 100_000,
                relations: [],
            }),
            entry(2, {
                title: 'Bridge OVA',
                format: 'OVA',
                episodes: 3,
                duration: 24,
                relations: [relation('PREQUEL', 1), relation('SEQUEL', 3)],
            }),
            entry(3, {
                title: 'Main series continuation',
                popularity: 90_000,
                relations: [relation('PREQUEL', 2)],
            }),
        ]);

        expect([...selected].toSorted((a, b) => a - b)).toEqual([1, 3]);
    });

    test('keeps the Sakamoto Days ONA sequel chain in the main story', () => {
        const selected = primaryFranchiseIds([
            entry(58939, {
                title: 'SAKAMOTO DAYS',
                format: 'ONA',
                episodes: 11,
                popularity: 217_177,
                relations: [relation('SEQUEL', 60285)],
            }),
            entry(60285, {
                title: 'SAKAMOTO DAYS Part 2',
                format: 'ONA',
                episodes: 11,
                popularity: 101_299,
                relations: [relation('PREQUEL', 58939)],
            }),
        ]);

        expect([...selected].toSorted((a, b) => a - b)).toEqual([58939, 60285]);
    });

    test('keeps My Hero Academia side content and Vigilantes out of the main story', () => {
        const selected = primaryFranchiseIds([
            entry(31964, {
                title: 'My Hero Academia',
                popularity: 866_699,
                relations: [
                    relation('SEQUEL', 33486),
                    relation('SIDE_STORY', 36896),
                    relation('SPIN_OFF', 60593),
                ],
            }),
            entry(33486, {
                title: 'My Hero Academia Season 2',
                popularity: 650_784,
                relations: [relation('PREQUEL', 31964), relation('SEQUEL', 36456)],
            }),
            entry(36456, {
                title: 'My Hero Academia Season 3',
                popularity: 596_710,
                relations: [
                    relation('PREQUEL', 33486),
                    relation('SEQUEL', 38408),
                    relation('SIDE_STORY', 36896),
                ],
            }),
            entry(38408, {
                title: 'My Hero Academia Season 4',
                popularity: 530_927,
                relations: [relation('PREQUEL', 36456)],
            }),
            entry(36896, {
                title: 'My Hero Academia: Two Heroes',
                format: 'MOVIE',
                episodes: 1,
                duration: 96,
                popularity: 220_935,
                relations: [relation('PARENT', 36456)],
            }),
            entry(60593, {
                title: 'My Hero Academia: Vigilantes',
                popularity: 72_715,
                relations: [relation('PARENT', 31964), relation('SEQUEL', 61942)],
            }),
            entry(61942, {
                title: 'My Hero Academia: Vigilantes Season 2',
                popularity: 39_044,
                relations: [relation('PREQUEL', 60593)],
            }),
            entry(63130, {
                title: 'My Hero Academia: More',
                format: 'SPECIAL',
                episodes: 1,
                duration: 23,
                popularity: 37_708,
                relations: [relation('PREQUEL', 36456)],
            }),
        ]);

        expect([...selected].toSorted((a, b) => a - b)).toEqual([31964, 33486, 36456, 38408]);
    });
});

describe('isFranchiseEntryEligible', () => {
    test('rejects unreleased and music media', () => {
        for (const status of ['FINISHED', 'RELEASING', 'HIATUS', 'CANCELLED', null] as const) {
            expect(isFranchiseEntryEligible({ status, format: 'TV' })).toBe(true);
        }

        expect(isFranchiseEntryEligible({ status: 'NOT_YET_RELEASED', format: 'TV' })).toBe(false);
        expect(isFranchiseEntryEligible({ status: 'FINISHED', format: 'MUSIC' })).toBe(false);
    });

    test('handles varied franchise inventory without relying on format', () => {
        const inventory = [
            { status: 'FINISHED', format: 'MOVIE' },
            { status: 'RELEASING', format: 'ONA' },
            { status: 'HIATUS', format: 'OVA' },
            { status: 'CANCELLED', format: 'SPECIAL' },
            { status: 'NOT_YET_RELEASED', format: 'MOVIE' },
            { status: null, format: null },
        ] as const;

        expect(inventory.filter(isFranchiseEntryEligible)).toHaveLength(5);
    });

    test('keeps the availability rule stable across seeded random inventory', () => {
        const statuses = [
            'FINISHED',
            'RELEASING',
            'HIATUS',
            'CANCELLED',
            'NOT_YET_RELEASED',
            null,
        ] as const;
        let seed = 0xa7c0;
        const inventory = Array.from({ length: 256 }, () => {
            seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
            return { status: statuses[seed % statuses.length], format: 'TV' as const };
        });

        expect(
            inventory.every(
                (entry) => isFranchiseEntryEligible(entry) === (entry.status !== 'NOT_YET_RELEASED')
            )
        ).toBe(true);
    });
});
