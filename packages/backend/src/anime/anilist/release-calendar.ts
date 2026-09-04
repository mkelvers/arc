import { ReleaseCalendarPageDocument } from '@arc/shared/anilist/generated/graphql';
import { request } from './client';
import { parseReleaseCalendarPage } from '@arc/core/catalog/release-calendar-parser';
import type { ReleaseCalendarEntry } from '@arc/core/catalog/release-calendar-parser';

const pageSize = 50;
const refreshAfterMs = 15 * 60 * 1_000;

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
                perPage: pageSize,
                airingAtGreater,
                airingAtLesser,
            },
            { forceRefresh: true, refreshAfterMs }
        );
        const parsed = parseReleaseCalendarPage(response);
        for (const entry of parsed.entries) {
            entries.set(entry.airingId, entry);
        }

        if (!parsed.hasNextPage) {
            break;
        }
    }

    return [
        ...new Map([...entries.values()].map((entry) => [entry.airingId, entry])).values(),
    ].sort((left, right) => left.airingAt.getTime() - right.airingAt.getTime());
}
