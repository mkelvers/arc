import { describe, expect, test } from 'bun:test';

import { latestNewAnimeTargets } from '@arc/core/server';

describe('new anime selection', () => {
    test('keeps the newest confirmed episode for each show', () => {
        const newest = {
            anilistId: 42,
            episode: 10,
            confirmedAt: new Date('2026-09-06T13:15:00Z'),
            airingAt: new Date('2026-09-06T13:00:00Z'),
        };
        const previous = {
            anilistId: 42,
            episode: 9,
            confirmedAt: new Date('2026-08-30T13:10:00Z'),
            airingAt: new Date('2026-08-30T13:00:00Z'),
        };

        expect(latestNewAnimeTargets([newest, previous])).toEqual([newest]);
    });
});
