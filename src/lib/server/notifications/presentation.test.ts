import { describe, expect, test } from 'bun:test';

import { notificationItems } from './presentation';

describe('AniList notification presentation', () => {
    test('presents airing notifications without trusting provider context markup', () => {
        const notification = {
            __typename: 'AiringNotification',
            id: 1,
            animeId: 21,
            episode: 7,
            contexts: ['<script>unsafe</script>'],
            createdAt: 1_700_000_000,
            media: {
                id: 21,
                type: 'ANIME',
                bannerImage: 'https://example.com/backdrop.jpg',
                title: { english: 'Example', romaji: null, native: null },
            },
        };

        expect(notificationItems([notification])).toEqual([
            {
                id: 1,
                kind: 'airing',
                anilistId: 21,
                episodeNumber: 7,
                title: 'Example',
                body: 'Episode 7 of Example has aired.',
                href: '/anime/21',
                image: 'https://example.com/backdrop.jpg',
                createdAt: 1_700_000_000,
            },
        ]);
    });

    test('presents a related release from AniList identity', () => {
        const notification = {
            __typename: 'RelatedMediaAdditionNotification',
            id: 2,
            mediaId: 34,
            context: 'New media added',
            createdAt: 1_700_000_001,
            media: {
                id: 34,
                type: 'ANIME',
                bannerImage: null,
                title: { english: null, romaji: 'Example sequel', native: null },
            },
        };

        expect(notificationItems([notification])).toEqual([
            {
                id: 2,
                kind: 'related_media',
                anilistId: 34,
                episodeNumber: null,
                title: 'Example sequel',
                body: 'Example sequel was announced as a related release for an anime in your list.',
                href: '/anime/34',
                image: null,
                createdAt: 1_700_000_001,
            },
        ]);
    });

    test('ignores related manga notifications', () => {
        const notification = {
            __typename: 'RelatedMediaAdditionNotification',
            id: 3,
            mediaId: 55,
            createdAt: 1_700_000_002,
            media: {
                id: 55,
                type: 'MANGA',
                bannerImage: null,
                title: { english: 'Manga', romaji: null, native: null },
            },
        };

        expect(notificationItems([notification])).toEqual([]);
    });

    test('ignores malformed provider data', () => {
        expect(
            notificationItems([
                {
                    __typename: 'AiringNotification',
                    id: 4,
                    animeId: 1,
                    episode: 'latest',
                },
            ])
        ).toEqual([]);
    });
});
