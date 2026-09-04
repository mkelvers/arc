import { describe, expect, test } from 'bun:test';

import { NotificationSchema } from '@arc/core';

describe('notification contracts', () => {
    test('accepts episode and dub availability entries', () => {
        const result = NotificationSchema.parse({
            id: '00000000-0000-0000-0000-000000000000',
            type: 'dub_available',
            title: 'Example Anime',
            episodeNumber: 4,
            imageUrl: null,
            href: '/anime/1/watch/4',
            createdAt: new Date().toISOString(),
            readAt: null,
        });

        expect(result.type).toBe('dub_available');
    });

    test('rejects malformed notification IDs', () => {
        expect(() =>
            NotificationSchema.parse({
                id: 'not-an-id',
                type: 'episode_available',
                title: 'Example Anime',
                episodeNumber: 1,
                imageUrl: null,
                href: '/anime/1/watch/1',
                createdAt: new Date().toISOString(),
                readAt: null,
            })
        ).toThrow();
    });
});
