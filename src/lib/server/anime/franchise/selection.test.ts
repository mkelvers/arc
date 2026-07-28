import { describe, expect, test } from 'bun:test';

import type { FranchiseSelectionEntry } from './selection';
import { primaryFranchiseIds } from './selection';

function entry(
    malId: number,
    overrides: Partial<FranchiseSelectionEntry> = {},
): FranchiseSelectionEntry {
    return {
        malId,
        title: `Anime ${malId}`,
        format: 'TV',
        episodes: 12,
        duration: 24,
        popularity: 10_000,
        secondary: false,
        relations: [],
        ...overrides,
    };
}

function relation(
    type: FranchiseSelectionEntry['relations'][number]['type'],
    malId: number,
) {
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
                relations: [
                    relation('PREQUEL', 1),
                    relation('SEQUEL', 7),
                ],
            }),
            entry(7, {
                title: 'Season 2',
                relations: [
                    relation('PREQUEL', 6),
                    relation('SEQUEL', 8),
                ],
            }),
            entry(8, {
                title: 'Season 2 Part 2',
                relations: [
                    relation('PREQUEL', 7),
                    relation('SEQUEL', 10),
                    relation('OTHER', 9),
                ],
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

        expect([...selected].toSorted((a, b) => a - b)).toEqual([
            1, 6, 7, 8, 9, 10,
        ]);
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
                relations: [
                    relation('PREQUEL', 1),
                    relation('SEQUEL', 3),
                    relation('SUMMARY', 32),
                ],
            }),
            entry(3, {
                title: 'Attack on Titan Season 3',
                popularity: 670_000,
                relations: [
                    relation('PREQUEL', 2),
                    relation('SEQUEL', 4),
                ],
            }),
            entry(4, {
                title: 'Attack on Titan Final Season',
                popularity: 630_000,
                relations: [
                    relation('PREQUEL', 3),
                    relation('SEQUEL', 5),
                ],
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
                relations: [
                    relation('ALTERNATIVE', 1),
                    relation('SEQUEL', 31),
                ],
            }),
            entry(31, {
                title: 'Recap Movie 2',
                format: 'MOVIE',
                episodes: 1,
                duration: 120,
                popularity: 31_000,
                relations: [
                    relation('PREQUEL', 30),
                    relation('SEQUEL', 32),
                ],
            }),
            entry(32, {
                title: 'Recap Movie 3',
                format: 'MOVIE',
                episodes: 1,
                duration: 120,
                popularity: 25_000,
                relations: [
                    relation('PREQUEL', 31),
                    relation('PARENT', 2),
                ],
            }),
        ]);

        expect([...selected].toSorted((a, b) => a - b)).toEqual([
            1, 2, 3, 4, 5,
        ]);
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
});
