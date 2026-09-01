const calendarWindowPaddingDays = 8;

export function releaseCalendarWindow(now = new Date()) {
    const daysSinceMonday = (now.getUTCDay() + 6) % 7;
    const utcWeekStart = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - daysSinceMonday
    );

    return {
        from: new Date(utcWeekStart - calendarWindowPaddingDays * (24 * 60 * 60 * 1_000)),
        to: new Date(utcWeekStart + calendarWindowPaddingDays * (24 * 60 * 60 * 1_000)),
    };
}
