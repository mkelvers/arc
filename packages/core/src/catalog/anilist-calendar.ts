import { ReleaseCalendarPageDocument } from '@arc/shared/graphql/generated/graphql';
import type { ReleaseCalendarEntry } from './release-calendar-parser';
import { parseReleaseCalendarPage } from './release-calendar-parser';
import { request } from './anilist-client';

export async function discoverReleaseCalendar(from: Date, to: Date) {
    if (!(from < to)) {
        throw new RangeError('Release calendar window must be ordered');
    }

    const entries = new Map<number, ReleaseCalendarEntry>();
    const airingAtGreater = Math.floor(from.getTime() / 1_000) - 1;
    const airingAtLesser = Math.ceil(to.getTime() / 1_000) + 1;

    for (let page = 1; ; page += 1) {
        const response = await request(
            ReleaseCalendarPageDocument,
            {
                page,
                perPage: 50,
                airingAtGreater,
                airingAtLesser,
            },
            { forceRefresh: true, refreshAfterMs: 15 * 60 * 1_000 }
        );
        const parsed = parseReleaseCalendarPage(response);
        for (const entry of parsed.entries) {
            entries.set(entry.airingId, entry);
        }

        if (!parsed.hasNextPage) {
            break;
        }
    }

    return [...entries.values()].sort(
        (left, right) => left.airingAt.getTime() - right.airingAt.getTime()
    );
}
