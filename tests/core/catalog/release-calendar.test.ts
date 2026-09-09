import { describe, expect, test } from 'bun:test';

import { mergeReleaseCalendarEntries, persistedReleaseSynopsis } from '@arc/core';

const snapshotEntry = {
    airingId: 10,
    anilistId: 101,
    episode: 3,
    airingAt: new Date('2026-09-07T12:00:00.000Z'),
    title: 'Snapshot title',
    synopsis: 'Snapshot synopsis',
    imageUrl: 'https://example.com/snapshot.jpg',
};

describe('release calendar persistence fallback', () => {
    test('uses the persisted release description for fallback targets', () => {
        expect(
            persistedReleaseSynopsis({
                description: '<p>A stored synopsis.</p><br>Second sentence.',
            })
        ).toBe('A stored synopsis. Second sentence.');
        expect(persistedReleaseSynopsis({ description: null })).toBeNull();
    });

    test('adds persisted episode targets when the refresh snapshot is stale', () => {
        const entries = mergeReleaseCalendarEntries(
            [snapshotEntry],
            [
                {
                    anilistId: 202,
                    episode: 10,
                    airingAt: new Date('2026-09-09T12:00:00.000Z'),
                    title: 'Persisted title',
                    synopsis: null,
                    imageUrl: 'https://example.com/poster.jpg',
                },
            ]
        );

        expect(entries).toEqual([
            snapshotEntry,
            {
                airingId: 1_000_202_010,
                anilistId: 202,
                episode: 10,
                airingAt: new Date('2026-09-09T12:00:00.000Z'),
                title: 'Persisted title',
                synopsis: null,
                imageUrl: 'https://example.com/poster.jpg',
            },
        ]);
    });

    test('lets a persisted target update a stale snapshot event for the same episode', () => {
        const entries = mergeReleaseCalendarEntries(
            [snapshotEntry],
            [
                {
                    anilistId: snapshotEntry.anilistId,
                    episode: snapshotEntry.episode,
                    airingAt: new Date('2026-09-08T12:00:00.000Z'),
                    title: 'Updated title',
                    synopsis: null,
                    imageUrl: null,
                },
            ]
        );

        expect(entries).toEqual([
            {
                ...snapshotEntry,
                airingAt: new Date('2026-09-08T12:00:00.000Z'),
                title: 'Updated title',
            },
        ]);
    });
});
