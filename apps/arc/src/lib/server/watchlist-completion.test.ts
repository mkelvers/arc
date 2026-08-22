import { describe, expect, test } from 'bun:test';

import { watchlistStateAfterPlayback } from '@arc/backend/internal/watchlist/completion';

const episodes = [
    { episodeId: 'one', number: 1 },
    { episodeId: 'two', number: 2 },
    { episodeId: 'three', number: 3 },
];

describe('automatic watchlist status', () => {
    test('completes a finished release after its verified final provider episode', () => {
        expect(
            watchlistStateAfterPlayback(
                'watching',
                { mediaStatus: 'FINISHED', expectedEpisodes: 3 },
                episodes,
                { ...episodes[2], completed: true }
            )
        ).toBe('completed');
    });

    test('does not add an unfinished anime to the watchlist when playback starts', () => {
        expect(
            watchlistStateAfterPlayback(
                null,
                { mediaStatus: 'RELEASING', expectedEpisodes: 12 },
                episodes,
                { ...episodes[0], completed: false }
            )
        ).toBeNull();
    });

    test('adds a finished anime to completed after its final episode', () => {
        expect(
            watchlistStateAfterPlayback(
                null,
                { mediaStatus: 'FINISHED', expectedEpisodes: 3 },
                episodes,
                { ...episodes[2], completed: true }
            )
        ).toBe('completed');
    });

    test('does not complete a finished anime before playback is complete', () => {
        expect(
            watchlistStateAfterPlayback(
                null,
                { mediaStatus: 'FINISHED', expectedEpisodes: 3 },
                episodes,
                { ...episodes[2], completed: false }
            )
        ).toBeNull();
    });

    test('moves an existing non-completed status to watching when playback starts', () => {
        expect(
            watchlistStateAfterPlayback(
                'plan_to_watch',
                { mediaStatus: 'RELEASING', expectedEpisodes: 12 },
                episodes,
                { ...episodes[0], completed: true }
            )
        ).toBe('watching');
    });

    test('does not complete an incomplete provider inventory', () => {
        expect(
            watchlistStateAfterPlayback(
                null,
                { mediaStatus: 'FINISHED', expectedEpisodes: 4 },
                episodes,
                { ...episodes[2], completed: true }
            )
        ).toBeNull();
    });

    test('ignores a completion report outside the stored provider inventory', () => {
        expect(
            watchlistStateAfterPlayback(
                null,
                { mediaStatus: 'RELEASING', expectedEpisodes: 12 },
                episodes,
                { episodeId: 'invented', number: 4, completed: false }
            )
        ).toBeNull();
    });

    test('does not reorder an already completed entry', () => {
        expect(
            watchlistStateAfterPlayback(
                'completed',
                { mediaStatus: 'RELEASING', expectedEpisodes: 12 },
                episodes,
                { ...episodes[2], completed: true }
            )
        ).toBe('completed');
    });
});
