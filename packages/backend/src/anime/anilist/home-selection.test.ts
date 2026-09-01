import { describe, expect, test } from 'bun:test';

import { selectPopularAnime } from './home-selection';

describe('popular homepage anime selection', () => {
    test('keeps the highest-ranked entry from each sequel chain', () => {
        const anime = [
            {
                id: 1,
                relations: {
                    edges: [
                        {
                            relationType: 'SEQUEL',
                            node: {
                                id: 2,
                            },
                        },
                    ],
                },
            },
            {
                id: 2,
                relations: {
                    edges: [
                        {
                            relationType: 'SEQUEL',
                            node: {
                                id: 3,
                            },
                        },
                    ],
                },
            },
            { id: 3 },
            { id: 4 },
        ];

        expect(selectPopularAnime(anime).map(({ id }) => id)).toEqual([1, 4]);
    });

    test('does not merge unrelated entries from the same franchise', () => {
        const anime = [
            {
                id: 1,
                relations: {
                    edges: [
                        {
                            relationType: 'SPIN_OFF',
                            node: {
                                id: 2,
                            },
                        },
                    ],
                },
            },
            { id: 2 },
        ];

        expect(selectPopularAnime(anime).map(({ id }) => id)).toEqual([1, 2]);
    });
});
