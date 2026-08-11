import { describe, expect, test } from 'bun:test';

import {
    canPreserveEpisodeMetadata,
    episodeAvailabilityTransitions,
    episodeInventoryIsExpected,
    episodeRefreshReason,
    nextRefreshAt,
} from './policy';
import type { AniListAnime } from '../anilist/types';

describe('episode refresh policy', () => {
    const future = new Date('2026-08-02T00:00:00Z');
    const now = new Date('2026-08-01T00:00:00Z').getTime();

    test('refreshes when TMDB metadata becomes available or changes identity', () => {
        expect(
            episodeRefreshReason(
                {
                    metadataExternalIdId: null,
                    nextRefreshAt: future,
                },
                42,
                now
            )
        ).toBe('metadata-source');
        expect(
            episodeRefreshReason(
                {
                    metadataExternalIdId: 41,
                    nextRefreshAt: future,
                },
                42,
                now
            )
        ).toBe('metadata-source');
    });

    test('does not discard known provenance when TMDB is unavailable', () => {
        expect(
            episodeRefreshReason(
                {
                    metadataExternalIdId: 42,
                    nextRefreshAt: future,
                },
                null,
                now
            )
        ).toBeNull();
    });

    test('keeps missing and scheduled refreshes explicit', () => {
        expect(episodeRefreshReason(null, null, now)).toBe('missing');
        expect(
            episodeRefreshReason(
                {
                    metadataExternalIdId: 42,
                    nextRefreshAt: new Date(now),
                },
                42,
                now
            )
        ).toBe('scheduled');
    });

    test('preserves partial metadata only for the same source identity', () => {
        expect(canPreserveEpisodeMetadata(42, 42)).toBeTrue();
        expect(canPreserveEpisodeMetadata(42, null)).toBeTrue();
        expect(canPreserveEpisodeMetadata(null, 42)).toBeFalse();
        expect(canPreserveEpisodeMetadata(41, 42)).toBeFalse();
    });

    test('does not probe playback before a release begins', () => {
        expect(episodeInventoryIsExpected('NOT_YET_RELEASED')).toBeFalse();
        expect(episodeInventoryIsExpected('RELEASING')).toBeTrue();
        expect(episodeInventoryIsExpected('FINISHED')).toBeTrue();
    });

    test('backs off stable finished titles even when optional fields are absent', () => {
        const before = Date.now() + 30 * 24 * 60 * 60 * 1_000;
        const next = nextRefreshAt({ status: 'FINISHED' } as AniListAnime, new Date(0));
        const after = Date.now() + 30 * 24 * 60 * 60 * 1_000;

        expect(next.getTime()).toBeGreaterThanOrEqual(before);
        expect(next.getTime()).toBeLessThanOrEqual(after);
    });

    test('reports new episodes and newly available dubs only', () => {
        const transitions = episodeAvailabilityTransitions(
            new Map([
                ['one', { audio: ['sub'] as const }],
                ['two', { audio: ['sub', 'dub'] as const }],
            ]),
            [
                { id: 'one', number: 1, audio: ['sub', 'dub'] as const },
                { id: 'two', number: 2, audio: ['sub', 'dub'] as const },
                { id: 'three', number: 3, audio: ['sub'] as const },
                { id: 'special', number: 3.5, audio: ['sub'] as const },
            ]
        );

        expect(transitions).toEqual([
            { episodeId: 'one', number: 1, airDate: null, kind: 'dub_available' },
            { episodeId: 'three', number: 3, airDate: null, kind: 'episode_available' },
        ]);
    });
});
