import type { z } from 'zod';

import type { ReleaseCalendarSchema } from '@arc/api-contract/anime';

export type ReleaseCalendarEvent = z.infer<typeof ReleaseCalendarSchema>['events'][number];

export type ReleaseCalendarDay = {
    key: string;
    dateLabel: string;
    weekdayLabel: string;
    today: boolean;
    events: ReleaseCalendarEvent[];
};

const dayMs = 24 * 60 * 60 * 1_000;

function dateParts(value: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(value);
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
    const year = Number(part('year'));
    const month = Number(part('month'));
    const day = Number(part('day'));
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        throw new RangeError('Could not determine a local calendar date');
    }
    return { year, month, day };
}

export function localDateKey(value: Date | string, timezone: string) {
    const parts = dateParts(new Date(value), timezone);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function releaseCalendarWeek(
    events: ReleaseCalendarEvent[],
    timezone: string,
    locale: string,
    now = new Date()
) {
    const today = dateParts(now, timezone);
    const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
    const mondayOffset = (new Date(todayUtc).getUTCDay() + 6) % 7;
    const mondayUtc = todayUtc - mondayOffset * dayMs;
    const todayKey = localDateKey(now, timezone);
    const dateLabels = new Intl.DateTimeFormat(locale, {
        timeZone: 'UTC',
        month: 'numeric',
        day: 'numeric',
    });
    const weekdayLabels = new Intl.DateTimeFormat(locale, {
        timeZone: 'UTC',
        weekday: 'short',
    });
    const eventsByDay = new Map<string, ReleaseCalendarEvent[]>();

    for (const event of events) {
        const key = localDateKey(event.airingAt, timezone);
        const dayEvents = eventsByDay.get(key) ?? [];
        dayEvents.push(event);
        eventsByDay.set(key, dayEvents);
    }

    return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(mondayUtc + index * dayMs);
        const key = date.toISOString().slice(0, 10);
        return {
            key,
            dateLabel: dateLabels.format(date),
            weekdayLabel: weekdayLabels.format(date),
            today: key === todayKey,
            events: (eventsByDay.get(key) ?? []).toSorted(
                (left, right) =>
                    new Date(left.airingAt).getTime() - new Date(right.airingAt).getTime()
            ),
        };
    });
}

export function localReleaseTime(airingAt: string, timezone: string, locale: string) {
    return new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
    }).format(new Date(airingAt));
}
