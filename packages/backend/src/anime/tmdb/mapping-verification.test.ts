import { describe, expect, test } from 'bun:test';

import { mappingNeedsVerification, tmdbMappingRevision } from './mapping-verification';

const now = Date.UTC(2026, 7, 1);

describe('TMDB mapping verification', () => {
    test('reuses a recently verified mapping without a write', () => {
        expect(
            mappingNeedsVerification(
                {
                    title: 'You and I Are Polar Opposites',
                    verifiedAt: new Date(now - 29 * 24 * 60 * 60 * 1_000),
                    mappingRevision: tmdbMappingRevision,
                },
                'You and I Are Polar Opposites',
                now
            )
        ).toBe(false);
    });

    test('revalidates an old or never-verified mapping', () => {
        expect(
            mappingNeedsVerification(
                {
                    title: 'You and I Are Polar Opposites',
                    verifiedAt: new Date(now - 30 * 24 * 60 * 60 * 1_000),
                    mappingRevision: tmdbMappingRevision,
                },
                'You and I Are Polar Opposites',
                now
            )
        ).toBe(true);
        expect(
            mappingNeedsVerification(
                {
                    title: 'You and I Are Polar Opposites',
                    verifiedAt: null,
                    mappingRevision: tmdbMappingRevision,
                },
                'You and I Are Polar Opposites',
                now
            )
        ).toBe(true);
    });

    test('revalidates immediately when the source title changes', () => {
        expect(
            mappingNeedsVerification(
                {
                    title: 'Old title',
                    verifiedAt: new Date(now),
                    mappingRevision: tmdbMappingRevision,
                },
                'Corrected title',
                now
            )
        ).toBe(true);
    });

    test('revalidates immediately when the mapping rules change', () => {
        expect(
            mappingNeedsVerification(
                {
                    title: 'Dragon Ball Z Kai: The Final Chapters',
                    verifiedAt: new Date(now),
                    mappingRevision: 'tmdb-mapping-v3',
                },
                'Dragon Ball Z Kai: The Final Chapters',
                now
            )
        ).toBe(true);
    });
});
