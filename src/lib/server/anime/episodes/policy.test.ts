import { describe, expect, test } from 'bun:test';

import { episodeRefreshReason } from './policy';

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
});
