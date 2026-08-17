import { describe, expect, test } from 'bun:test';

import { presentNotification } from './presentation';

describe('notification presentation', () => {
    test('keeps the audio fact separate from the availability description', () => {
        const facts = {
            kind: 'episode_available' as const,
            anilistId: 21,
            episodeId: 'episode/7',
            episodeNumber: 7,
            audio: ['dub', 'sub'] as const,
        };

        expect(presentNotification(facts)).toEqual({
            body: 'Episode 7 is now ready to watch.',
            audioLabel: 'Dub | Sub',
            href: '/anime/21',
            watchHref: '/anime/21/watch/episode%2F7',
            actionLabel: 'Watch Now',
        });
    });

    test('describes a new dub without claiming it is a new episode', () => {
        expect(
            presentNotification({
                kind: 'audio_available',
                anilistId: 21,
                episodeId: '7',
                episodeNumber: 7,
                audio: ['dub'],
            }).body
        ).toBe('A new audio option is available for Episode 7.');
    });

    test('announcements lead to anime details because they are not yet playable', () => {
        const facts = {
            kind: 'season_announced' as const,
            anilistId: 34,
            episodeId: null,
            episodeNumber: null,
            audio: [] as const,
        };

        expect(presentNotification(facts)).toEqual({
            body: 'A new season has been announced for an anime in your library.',
            audioLabel: null,
            href: '/anime/34',
            watchHref: null,
            actionLabel: null,
        });
    });
});
