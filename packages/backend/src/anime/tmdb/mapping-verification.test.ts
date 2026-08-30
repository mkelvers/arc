import { describe, expect, test } from 'bun:test';

import { mappingNeedsVerification } from './mapping-verification';

const now = Date.UTC(2026, 7, 1);

describe('TMDB mapping verification', () => {
    test('reuses a recently verified mapping without a write', () => {
        expect(
            mappingNeedsVerification(
                {
                    title: 'You and I Are Polar Opposites',
                    mediaType: 'tv',
                    verifiedAt: new Date(now - 29 * 24 * 60 * 60 * 1_000),
                    mappingRevision: 'tmdb-mapping-v9',
                },
                'You and I Are Polar Opposites',
                'tv',
                now
            )
        ).toBe(false);
    });

    test('revalidates an old or never-verified mapping', () => {
        expect(
            mappingNeedsVerification(
                {
                    title: 'You and I Are Polar Opposites',
                    mediaType: 'tv',
                    verifiedAt: new Date(now - 30 * 24 * 60 * 60 * 1_000),
                    mappingRevision: 'tmdb-mapping-v9',
                },
                'You and I Are Polar Opposites',
                'tv',
                now
            )
        ).toBe(true);
        expect(
            mappingNeedsVerification(
                {
                    title: 'You and I Are Polar Opposites',
                    mediaType: 'tv',
                    verifiedAt: null,
                    mappingRevision: 'tmdb-mapping-v9',
                },
                'You and I Are Polar Opposites',
                'tv',
                now
            )
        ).toBe(true);
    });

    test('revalidates immediately when the source title changes', () => {
        expect(
            mappingNeedsVerification(
                {
                    title: 'Old title',
                    mediaType: 'tv',
                    verifiedAt: new Date(now),
                    mappingRevision: 'tmdb-mapping-v9',
                },
                'Corrected title',
                'tv',
                now
            )
        ).toBe(true);
    });

    test('revalidates immediately when the mapping rules change', () => {
        expect(
            mappingNeedsVerification(
                {
                    title: 'Dragon Ball Z Kai: The Final Chapters',
                    mediaType: 'tv',
                    verifiedAt: new Date(now),
                    mappingRevision: 'tmdb-mapping-v3',
                },
                'Dragon Ball Z Kai: The Final Chapters',
                'tv',
                now
            )
        ).toBe(true);
    });

    test('revalidates a mapping with the wrong media type', () => {
        expect(
            mappingNeedsVerification(
                {
                    title: 'Jujutsu Kaisen 0',
                    mediaType: 'tv',
                    verifiedAt: new Date(now),
                    mappingRevision: 'tmdb-mapping-v9',
                },
                'Jujutsu Kaisen 0',
                'movie',
                now
            )
        ).toBe(true);
    });
});
