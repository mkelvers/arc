import { describe, expect, test } from 'bun:test';

import {
    availableEpisodeCount,
    canPreserveEpisodeMetadata,
    classificationRefreshDue,
    episodeInventoryIsExpected,
    episodeMetadataNeedsRefresh,
    episodeMetadataRevision,
    episodeRefreshRetryDelay,
    episodeRefreshReason,
    nextRefreshAt,
    providerEpisodeCount,
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

    test('refreshes stored rows with an image but missing episode metadata', () => {
        expect(
            episodeMetadataNeedsRefresh(
                [{ image: 'https://image.example/still.jpg', title: '', overview: '' }],
                true
            )
        ).toBeTrue();
        expect(
            episodeMetadataNeedsRefresh([{ image: null, title: '', overview: '' }], true)
        ).toBeTrue();
        expect(
            episodeMetadataNeedsRefresh(
                [
                    {
                        image: 'https://image.example/still.jpg',
                        title: 'From Now On',
                        overview: 'Text',
                    },
                ],
                true
            )
        ).toBeFalse();
        expect(
            episodeMetadataNeedsRefresh(
                [{ image: 'https://image.example/still.jpg', title: '', overview: '' }],
                false
            )
        ).toBeFalse();
    });

    test('refreshes episode metadata written by an obsolete enrichment revision', () => {
        const complete = [
            {
                image: 'https://image.example/still.jpg',
                title: 'Death and Loss',
                overview: 'Wrong-language text stored by the old fallback.',
            },
        ];

        expect(episodeMetadataNeedsRefresh(complete, true, null)).toBeTrue();
        expect(episodeMetadataNeedsRefresh(complete, true, 'tmdb-episode-v1')).toBeTrue();
        expect(episodeMetadataNeedsRefresh(complete, true, episodeMetadataRevision)).toBeFalse();
    });

    test('does not probe playback before a release begins', () => {
        expect(episodeInventoryIsExpected('NOT_YET_RELEASED')).toBeFalse();
        expect(episodeInventoryIsExpected('RELEASING')).toBeTrue();
        expect(episodeInventoryIsExpected('FINISHED')).toBeTrue();
    });

    test('refreshes filler data daily while airing and weekly otherwise', () => {
        const now = new Date('2026-08-20T12:00:00Z').getTime();

        expect(
            classificationRefreshDue(new Date('2026-08-20T11:59:59Z'), 'FINISHED', null, now)
        ).toBeTrue();
        expect(classificationRefreshDue(null, 'FINISHED', 'animefillerlist-v1', now)).toBeTrue();
        expect(
            classificationRefreshDue(
                new Date('2026-08-19T11:59:59Z'),
                'RELEASING',
                'animefillerlist-v1',
                now
            )
        ).toBeTrue();
        expect(
            classificationRefreshDue(
                new Date('2026-08-19T12:00:01Z'),
                'RELEASING',
                'animefillerlist-v1',
                now
            )
        ).toBeFalse();
        expect(
            classificationRefreshDue(
                new Date('2026-08-13T11:59:59Z'),
                'FINISHED',
                'animefillerlist-v1',
                now
            )
        ).toBeTrue();
        expect(
            classificationRefreshDue(
                new Date('2026-08-13T12:00:01Z'),
                'FINISHED',
                'animefillerlist-v1',
                now
            )
        ).toBeFalse();
    });

    test('does not use AniList segment totals as provider episode counts', () => {
        expect(providerEpisodeCount({ format: 'TV_SHORT', episodes: 120 })).toBeNull();
        expect(providerEpisodeCount({ format: 'TV', episodes: 24 })).toBe(24);
    });

    test('expects all episodes before the next airing episode', () => {
        expect(
            availableEpisodeCount({
                status: 'RELEASING',
                nextAiringEpisode: { episode: 7, airingAt: Math.floor(Date.now() / 1_000) + 3_600 },
            })
        ).toBe(6);
        expect(availableEpisodeCount({ status: 'RELEASING', nextAiringEpisode: null })).toBeNull();
        expect(
            availableEpisodeCount({
                status: 'FINISHED',
                nextAiringEpisode: { episode: 7, airingAt: 1_786_968_000 },
            })
        ).toBeNull();
        expect(
            availableEpisodeCount({
                status: 'RELEASING',
                nextAiringEpisode: { episode: 6, airingAt: Math.floor(Date.now() / 1_000) - 1 },
            })
        ).toBe(6);
    });

    test('backs off scheduled provider checks from minutes to days', () => {
        expect(
            [0, 1, 2, 3, 4, 5, 6, 7].map((attempts) => episodeRefreshRetryDelay(attempts))
        ).toEqual([
            120_000, 300_000, 900_000, 3_600_000, 21_600_000, 43_200_000, 86_400_000, 86_400_000,
        ]);
    });

    test('retires a provider check after twelve attempts or fourteen days', () => {
        const now = Date.now();

        expect(episodeRefreshRetryDelay(11, now, now)).toBeNull();
        expect(episodeRefreshRetryDelay(3, now - 14 * 24 * 60 * 60 * 1_000, now)).toBeNull();
    });

    test('backs off stable finished titles even when optional fields are absent', () => {
        const before = Date.now() + 30 * 24 * 60 * 60 * 1_000;
        const next = nextRefreshAt({ status: 'FINISHED' } as AniListAnime, new Date(0));
        const after = Date.now() + 30 * 24 * 60 * 60 * 1_000;

        expect(next.getTime()).toBeGreaterThanOrEqual(before);
        expect(next.getTime()).toBeLessThanOrEqual(after);
    });
});
