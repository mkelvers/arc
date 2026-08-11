import { describe, expect, test } from 'bun:test';

import { ProgressSchedule } from './progress';

describe('playback progress schedule', () => {
    test('saves after each 30 seconds of active media progress', () => {
        const schedule = new ProgressSchedule();
        schedule.start(120);

        expect(
            schedule.update({
                currentTime: 149.9,
                duration: 1_440,
                playing: true,
            })
        ).toBeNull();
        expect(
            schedule.update({
                currentTime: 150,
                duration: 1_440,
                playing: true,
            })
        ).toBe('periodic');
        expect(
            schedule.update({
                currentTime: 180,
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
