import { describe, expect, test } from 'bun:test';
import { localDateKey, localReleaseTime, releaseCalendarWeek } from './release-calendar';

const event = (airingId: number, airingAt: string) => ({
    airingId,
    anilistId: airingId,
    episode: 1,
    airingAt,
    title: `Anime ${airingId}`,
    synopsis: null,
    image: null,
});

describe('release calendar timezone grouping', () => {
    test('groups an airing by the browser local date', () => {
        expect(localDateKey('2026-01-05T23:30:00.000Z', 'Europe/Copenhagen')).toBe('2026-01-06');
        expect(localDateKey('2026-01-05T23:30:00.000Z', 'America/Los_Angeles')).toBe('2026-01-05');
    });

    test('builds a Monday to Sunday week and highlights local today', () => {
        const week = releaseCalendarWeek(
            [event(1, '2026-09-02T12:00:00.000Z')],
            'Europe/Copenhagen',
            'en-US',
            new Date('2026-09-02T08:00:00.000Z')
        );

        expect(week.map((day) => day.key)).toEqual([
            '2026-08-31',
            '2026-09-01',
            '2026-09-02',
            '2026-09-03',
            '2026-09-04',
            '2026-09-05',
            '2026-09-06',
        ]);
        expect(week.filter((day) => day.today).map((day) => day.key)).toEqual(['2026-09-02']);
        expect(week[2]?.events.map(({ airingId }) => airingId)).toEqual([1]);
        expect(week[0]?.dateLabel).toBe('8/31');
        expect(week[0]?.weekdayLabel).toBe('Mon');
    });

    test('formats the same instant using the real daylight-saving offset', () => {
        expect(localReleaseTime('2026-01-05T21:00:00.000Z', 'Europe/Copenhagen', 'da-DK')).toBe(
            '22.00'
        );
        expect(localReleaseTime('2026-07-05T20:00:00.000Z', 'Europe/Copenhagen', 'da-DK')).toBe(
            '22.00'
        );
    });
});
