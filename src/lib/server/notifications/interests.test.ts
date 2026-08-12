import { describe, expect, test } from 'bun:test';

import { resolveNotificationInterests, type RelatedAnime } from './interests';

function anime(id: number, overrides: Partial<RelatedAnime> = {}): RelatedAnime {
    return { id, type: 'ANIME', status: 'FINISHED', relations: [], ...overrides };
}

describe('notification interests', () => {
    test('a finished first season covers every later sequel regardless of release status', async () => {
        const media = new Map([
            [1, anime(1, { relations: [{ id: 2, type: 'SEQUEL' }] })],
            [2, anime(2, { relations: [{ id: 3, type: 'SEQUEL' }] })],
            [3, anime(3, { status: 'RELEASING', relations: [{ id: 4, type: 'SEQUEL' }] })],
            [4, anime(4, { status: 'NOT_YET_RELEASED' })],
        ]);

        expect(
            await resolveNotificationInterests([1], async (ids) =>
                ids.flatMap((id) => media.get(id) ?? [])
            )
        ).toEqual([
            { anilistId: 1, sourceAnilistId: 1 },
            { anilistId: 2, sourceAnilistId: 1 },
            { anilistId: 3, sourceAnilistId: 1 },
            { anilistId: 4, sourceAnilistId: 1 },
        ]);
    });

    test('keeps every root and ignores non-anime relations', async () => {
        expect(
            await resolveNotificationInterests([2, 1], async (ids) =>
                ids.map((id) =>
                    id === 1
                        ? anime(1, { relations: [{ id: 3, type: 'SEQUEL' }] })
                        : id === 2
                          ? anime(2)
                          : anime(3, { type: 'MANGA' })
                )
            )
        ).toEqual([
            { anilistId: 1, sourceAnilistId: 1 },
            { anilistId: 2, sourceAnilistId: 2 },
        ]);
    });

    test('does not follow side stories and terminates cyclic sequel data', async () => {
        const media = new Map([
            [
                1,
                anime(1, {
                    relations: [
                        { id: 2, type: 'SIDE_STORY' },
                        { id: 3, type: 'SEQUEL' },
                    ],
                }),
            ],
            [2, anime(2, { status: 'RELEASING' })],
            [3, anime(3, { relations: [{ id: 1, type: 'SEQUEL' }] })],
        ]);

        expect(
            await resolveNotificationInterests([1], async (ids) =>
                ids.flatMap((id) => media.get(id) ?? [])
            )
        ).toEqual([
            { anilistId: 1, sourceAnilistId: 1 },
            { anilistId: 3, sourceAnilistId: 1 },
        ]);
    });
});
