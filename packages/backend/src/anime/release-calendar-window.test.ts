import { describe, expect, test } from 'bun:test';

import { releaseCalendarWindow } from './release-calendar-window';

describe('release calendar refresh window', () => {
    test('pads the UTC week enough to cover local weeks across timezones', () => {
        const { from, to } = releaseCalendarWindow(new Date('2026-09-02T12:00:00.000Z'));

        expect(from.toISOString()).toBe('2026-08-23T00:00:00.000Z');
        expect(to.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    });
});
