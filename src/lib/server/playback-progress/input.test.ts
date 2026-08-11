import { describe, expect, test } from 'bun:test';

import { parsePlaybackProgress } from './input';

describe('playback progress input', () => {
    test('accepts a valid progress report', () => {
        expect(
            parsePlaybackProgress({
                animeId: 21,
                episodeId: 'episode-7',
                episodeNumber: 7,
                positionSeconds: 412.5,
                durationSeconds: 1_440,
                completed: false,
            })
        ).toEqual({
            animeId: 21,
            episodeId: 'episode-7',
            episodeNumber: 7,
            positionSeconds: 412.5,
            durationSeconds: 1_440,
            completed: false,
        });
    });

    test('clamps a report to the episode duration', () => {
        expect(
            parsePlaybackProgress({
                animeId: 21,
                episodeId: 'episode-7',
                episodeNumber: 7,
                positionSeconds: 1_441,
                durationSeconds: 1_440,
                completed: true,
            })?.positionSeconds
        ).toBe(1_440);
    });

    test('rejects malformed progress reports', () => {
        expect(
            parsePlaybackProgress({
                animeId: 0,
                episodeId: '',
                episodeNumber: Number.NaN,
                positionSeconds: -1,
                durationSeconds: 0,
                completed: 'no',
            })
        ).toBeNull();
    });
});
