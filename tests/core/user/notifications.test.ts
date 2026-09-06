import { describe, expect, test } from 'bun:test';

import { compactNotificationEntries } from '@arc/core';

const createdAt = new Date('2026-09-06T10:00:00Z');

describe('notification entries', () => {
    test('collapses same-batch dubbed episodes into one entry', () => {
        const entries = Array.from({ length: 12 }, (_, index) => ({
            id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            animeId: 42,
            episodeId: `episode-${index + 1}`,
            type: 'dub_available' as const,
            title: 'Haikyu!! TO THE TOP Part 2',
            episodeNumber: index + 1,
            imageUrl: null,
            anilistId: 123,
            createdAt,
            readAt: null,
        }));

        expect(compactNotificationEntries(entries)).toEqual([
            {
                ...entries[0],
                episodeNumbers: Array.from({ length: 12 }, (_, index) => index + 1),
                dubEpisodeNumbers: Array.from({ length: 12 }, (_, index) => index + 1),
                relatedIds: entries.slice(1).map(({ id }) => id),
            },
        ]);
    });

    test('keeps separate sync batches as separate entries', () => {
        const entries = [1, 2].map((episodeNumber, index) => ({
            id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            animeId: 42,
            episodeId: `episode-${episodeNumber}`,
            type: 'dub_available' as const,
            title: 'Haikyu!! TO THE TOP Part 2',
            episodeNumber,
            imageUrl: null,
            anilistId: 123,
            createdAt: new Date(createdAt.getTime() + index * 1_000),
            readAt: null,
        }));

        expect(compactNotificationEntries(entries)).toHaveLength(2);
    });

    test('merges same-batch episode and dub entries', () => {
        const entries = [
            {
                id: '00000000-0000-4000-8000-000000000001',
                animeId: 42,
                episodeId: 'episode-12',
                type: 'episode_available' as const,
                title: 'Haikyu!! TO THE TOP Part 2',
                episodeNumber: 12,
                imageUrl: null,
                anilistId: 123,
                createdAt,
                readAt: null,
            },
            {
                id: '00000000-0000-4000-8000-000000000002',
                animeId: 42,
                episodeId: 'episode-12',
                type: 'dub_available' as const,
                title: 'Haikyu!! TO THE TOP Part 2',
                episodeNumber: 12,
                imageUrl: null,
                anilistId: 123,
                createdAt,
                readAt: null,
            },
        ];

        expect(compactNotificationEntries(entries)).toEqual([
            {
                ...entries[0],
                episodeNumbers: [12],
                dubEpisodeNumbers: [12],
                relatedIds: [entries[1]!.id],
            },
        ]);
    });
});
