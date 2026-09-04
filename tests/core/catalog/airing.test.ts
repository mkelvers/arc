import { describe, expect, test } from 'bun:test';

import { parseAiringMedia } from '@arc/core/catalog/airing';

describe('AniList airing normalization', () => {
    test('selects the latest episode already aired', () => {
        expect(
            parseAiringMedia(
                {
                    id: 42,
                    nextAiringEpisode: { airingAt: 2_000, episode: 4 },
                    airingSchedule: {
                        pageInfo: { lastPage: 2 },
                        nodes: [
                            { airingAt: 1_000, episode: 2 },
                            { airingAt: 1_500, episode: 3 },
                            { airingAt: 2_000, episode: 4 },
                            null,
                        ],
                    },
                },
                new Date(1_600_000)
            )
        ).toEqual({
            id: 42,
            nextAiringAt: 2_000,
            nextAiringEpisode: 4,
            latestAiredAt: 1_500,
            latestAiredEpisode: 3,
            scheduleLastPage: 2,
        });
    });

    test('rejects malformed provider data', () => {
        expect(() => parseAiringMedia({ id: 42 }, new Date())).toThrow(
            'AniList returned invalid airing discovery data'
        );
    });
});
