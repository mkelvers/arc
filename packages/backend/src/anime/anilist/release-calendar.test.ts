import { describe, expect, test } from 'bun:test';

import {
    deduplicateReleaseCalendarEntries,
    parseReleaseCalendarPage,
} from './release-calendar-parser';

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

    test('falls back through the AniList title fields and artwork sizes', () => {
        const result = parseReleaseCalendarPage({
            Page: {
                pageInfo: { hasNextPage: false },
                airingSchedules: [
                    {
                        id: 4,
                        episode: 1,
                        airingAt: 1_788_000_000,
                        media: {
                            id: 103,
                            isAdult: false,
                            description: null,
                            title: { english: null, romaji: null, native: 'ネイティブ' },
                            coverImage: {
                                extraLarge: null,
                                large: 'https://example.com/large.jpg',
                            },
                        },
                    },
                ],
            },
        });

        expect(result.entries[0]?.title).toBe('ネイティブ');
        expect(result.entries[0]?.imageUrl).toBe('https://example.com/large.jpg');
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
        expect(() =>
            parseReleaseCalendarPage({
                Page: {
                    pageInfo: { hasNextPage: false },
                    airingSchedules: [
                        { id: 1, episode: 1, airingAt: Number.MAX_SAFE_INTEGER, media },
                    ],
                },
            })
        ).toThrow('AniList returned invalid release calendar data');
    });

    test('deduplicates entries returned across paginated responses by AniList airing ID', () => {
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
