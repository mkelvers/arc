import { describe, expect, test } from 'bun:test';

import { airingTargetSchedules } from '@arc/core';

describe('global airing reconciliation', () => {
    test('schedules both the latest aired episode and the next airing episode without user interest', () => {
        expect(
            airingTargetSchedules([
                {
                    id: 177637,
                    latestAiredEpisode: 8,
                    latestAiredAt: 1_787_499_000,
                    nextAiringEpisode: 9,
                    nextAiringAt: 1_788_103_800,
                },
            ])
        ).toEqual([
            {
                anilistId: 177637,
                episode: 8,
                airingAt: new Date(1_787_499_000_000),
            },
            {
                anilistId: 177637,
                episode: 9,
                airingAt: new Date(1_788_103_800_000),
            },
        ]);
    });

    test('does not invent a target when AniList has no exact episode schedule', () => {
        expect(
            airingTargetSchedules([
                {
                    id: 1,
                    latestAiredEpisode: null,
                    latestAiredAt: null,
                    nextAiringEpisode: null,
                    nextAiringAt: null,
                },
            ])
        ).toEqual([]);
    });
});
