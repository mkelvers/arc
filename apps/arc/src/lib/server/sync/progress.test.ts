import { describe, expect, test } from 'bun:test';

import { anilistCompletedEpisodes } from './progress';

describe('AniList playback progress publication', () => {
    test('exports only episodes that local playback has completed', () => {
        expect(anilistCompletedEpisodes({ episodeNumber: 3, completed: false })).toBe(2);
        expect(anilistCompletedEpisodes({ episodeNumber: 3, completed: true })).toBe(3);
    });
});
