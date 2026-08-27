import { describe, expect, test } from 'bun:test';

import { nextProgressEventAt, ProgressSchedule } from './progress';

describe('playback progress schedule', () => {
    test('saves after each 5 seconds of active media progress', () => {
        const schedule = new ProgressSchedule();
        schedule.start(120);

        expect(
            schedule.update({
                currentTime: 124.9,
                duration: 1_440,
                playing: true,
            })
        ).toBeNull();
        expect(
            schedule.update({
                currentTime: 125,
                duration: 1_440,
                playing: true,
            })
        ).toBe('periodic');
        expect(
            schedule.update({
                currentTime: 130,
                duration: 1_440,
                playing: false,
            })
        ).toBeNull();
    });

    test('saves once immediately before the episode ends', () => {
        const schedule = new ProgressSchedule();
        schedule.start(0);
        const duration = 1_440;

        expect(
            schedule.update({
                currentTime: duration - 5,
                duration,
                playing: true,
            })
        ).toBe('ending');
        expect(
            schedule.update({
                currentTime: duration - 1,
                duration,
                playing: true,
            })
        ).toBeNull();
    });
});

describe('progress event ordering', () => {
    test('keeps saves monotonic when the wall clock does not advance', () => {
        expect(nextProgressEventAt(1_000, 900)).toBe(1_001);
        expect(nextProgressEventAt(1_000, 2_000)).toBe(2_000);
    });
});
