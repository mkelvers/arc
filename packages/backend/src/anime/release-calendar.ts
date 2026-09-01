import { asc, and, eq, gte, lt } from 'drizzle-orm';

import { db } from '@arc/db';
import { animeAiringSchedule, schedulerHeartbeat } from '@arc/db/schema';
import { discoverReleaseCalendar } from './anilist/release-calendar';
import { releaseCalendarWindow } from './release-calendar-window';

export async function refreshReleaseCalendar(now = new Date()) {
    const { from, to } = releaseCalendarWindow(now);
    const entries = await discoverReleaseCalendar(from, to);
    const sourceFetchedAt = new Date();

    await db.transaction(async (tx) => {
        await tx.delete(animeAiringSchedule);
        if (entries.length) {
            await tx.insert(animeAiringSchedule).values(
                entries.map((entry) => ({
                    airingId: entry.airingId,
                    anilistId: entry.anilistId,
                    episode: entry.episode,
                    airingAt: entry.airingAt,
                    title: entry.title,
                    synopsis: entry.synopsis,
                    imageUrl: entry.imageUrl,
                    sourceFetchedAt,
                }))
            );
        }
    });

    return { entries: entries.length, sourceFetchedAt };
}

export async function releaseCalendar(now = new Date()) {
    const { from, to } = releaseCalendarWindow(now);
    const [rows, heartbeat] = await Promise.all([
        db
            .select({
                airingId: animeAiringSchedule.airingId,
                anilistId: animeAiringSchedule.anilistId,
                episode: animeAiringSchedule.episode,
                airingAt: animeAiringSchedule.airingAt,
                title: animeAiringSchedule.title,
                synopsis: animeAiringSchedule.synopsis,
                imageUrl: animeAiringSchedule.imageUrl,
            })
            .from(animeAiringSchedule)
            .where(
                and(gte(animeAiringSchedule.airingAt, from), lt(animeAiringSchedule.airingAt, to))
            )
            .orderBy(asc(animeAiringSchedule.airingAt), asc(animeAiringSchedule.airingId)),
        db
            .select({ refreshedAt: schedulerHeartbeat.lastCalendarRefreshAt })
            .from(schedulerHeartbeat)
            .where(eq(schedulerHeartbeat.name, 'anime-scheduler'))
            .limit(1)
            .then((result) => result[0] ?? null),
    ]);

    return {
        events: rows.map((row) => ({
            airingId: row.airingId,
            anilistId: row.anilistId,
            episode: row.episode,
            airingAt: row.airingAt.toISOString(),
            title: row.title,
            synopsis: row.synopsis,
            image: row.imageUrl,
        })),
        refreshedAt: heartbeat?.refreshedAt?.toISOString() ?? null,
    };
}
