import { describe, expect, test } from 'bun:test';

import { anilistCompletedEpisodes, shouldImportAnilistProgress } from './progress';

describe('AniList playback progress reconciliation', () => {
    test('does not roll an in-progress local episode back to AniList completed progress', () => {
        expect(shouldImportAnilistProgress({ episodeNumber: 3, completed: false }, 2)).toBe(false);
    });

    test('imports AniList progress only when it advances completed episodes', () => {
        expect(shouldImportAnilistProgress({ episodeNumber: 3, completed: false }, 3)).toBe(true);
        expect(shouldImportAnilistProgress({ episodeNumber: 3, completed: true }, 3)).toBe(false);
    });

    test('exports only episodes that local playback has completed', () => {
        expect(anilistCompletedEpisodes({ episodeNumber: 3, completed: false })).toBe(2);
        expect(anilistCompletedEpisodes({ episodeNumber: 3, completed: true })).toBe(3);
    });
});
