import { describe, expect, test } from 'bun:test';

import {
    deduplicateReleaseCalendarEntries,
    parseReleaseCalendarPage,
} from '@arc/core/catalog/release-calendar-parser';

const media = {
    id: 101,
    isAdult: false,
    description: '<p>Airing synopsis</p>',
    title: { english: 'Airing title', romaji: 'Airing title', native: null },
    coverImage: { extraLarge: 'https://example.com/large.jpg', large: null },
};

describe('AniList release calendar validation', () => {
    test('keeps valid non-adult entries and skips null or adult media', () => {
        const result = parseReleaseCalendarPage({
            Page: {
                pageInfo: { hasNextPage: true },
                airingSchedules: [
                    { id: 1, episode: 3, airingAt: 1_788_000_000, media },
                    { id: 2, episode: 4, airingAt: 1_788_000_100, media: null },
                    {
                        id: 3,
                        episode: 5,
                        airingAt: 1_788_000_200,
                        media: { ...media, id: 102, isAdult: true },
                    },
                ],
            },
        });

        expect(result.hasNextPage).toBe(true);
        expect(result.entries).toEqual([
            {
                airingId: 1,
                anilistId: 101,
                episode: 3,
                airingAt: new Date('2026-08-29T10:40:00.000Z'),
                title: 'Airing title',
                synopsis: 'Airing synopsis',
                imageUrl: 'https://example.com/large.jpg',
            },
        ]);
    });

    test('rejects malformed schedule payloads', () => {
        expect(() => parseReleaseCalendarPage({ Page: null })).toThrow(
            'AniList returned invalid release calendar data'
        );
        expect(() =>
            parseReleaseCalendarPage({
                Page: { pageInfo: { hasNextPage: false }, airingSchedules: [{ id: 1 }] },
            })
        ).toThrow('AniList returned invalid release calendar data');
    });

    test('deduplicates entries returned across pages by airing ID', () => {
        const entry = {
            airingId: 1,
            anilistId: 101,
            episode: 3,
            airingAt: new Date('2026-08-29T10:40:00.000Z'),
            title: 'Airing title',
            synopsis: 'Airing synopsis',
            imageUrl: 'https://example.com/large.jpg',
        };

        expect(deduplicateReleaseCalendarEntries([entry, entry])).toEqual([entry]);
    });
});
