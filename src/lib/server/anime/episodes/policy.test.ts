import { describe, expect, test } from 'bun:test';

import { episodeRefreshReason, nextRefreshAt } from './policy';
import type { AniListAnime } from './types';

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
                now,
            ),
        ).toBe('metadata-source');
        expect(
            episodeRefreshReason(
                {
                    metadataExternalIdId: 41,
                    nextRefreshAt: future,
                },
                42,
                now,
            ),
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
                now,
            ),
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
                now,
            ),
        ).toBe('scheduled');
    });

    test('rechecks non-official metadata daily for finished titles', () => {
        const before = Date.now() + 24 * 60 * 60 * 1_000;
        const next = nextRefreshAt(
            { status: 'FINISHED' } as AniListAnime,
            new Date(0),
            true,
        );
        const after = Date.now() + 24 * 60 * 60 * 1_000;

        expect(next.getTime()).toBeGreaterThanOrEqual(before);
        expect(next.getTime()).toBeLessThanOrEqual(after);
    });
});
