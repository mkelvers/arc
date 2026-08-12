import { describe, expect, test } from 'bun:test';

import {
    notificationAudioLabel,
    notificationBody,
    notificationHref,
    notificationWatchHref,
} from './presentation';

describe('notification presentation', () => {
    test('keeps the audio fact separate from the availability description', () => {
        const facts = {
            kind: 'episode_available' as const,
            anilistId: 21,
            episodeId: 'episode/7',
            episodeNumber: 7,
            audio: ['dub', 'sub'] as const,
        };

        expect(notificationAudioLabel(facts.audio)).toBe('Dub | Sub');
        expect(notificationBody(facts)).toBe('Episode 7 is now ready to watch.');
        expect(notificationHref(facts)).toBe('/anime/21');
        expect(notificationWatchHref(facts)).toBe('/anime/21/watch/episode%2F7');
    });

    test('describes a new dub without claiming it is a new episode', () => {
        expect(
            notificationBody({
                kind: 'audio_available',
                anilistId: 21,
                episodeId: '7',
                episodeNumber: 7,
                audio: ['dub'],
            })
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

        expect(notificationAudioLabel(facts.audio)).toBeNull();
        expect(notificationHref(facts)).toBe('/anime/34');
        expect(notificationWatchHref(facts)).toBeNull();
    });
});
