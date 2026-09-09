import { asc, and, eq, gte, inArray, lt } from 'drizzle-orm';

import { db } from '@arc/shared/db';
import {
    animeAiringSchedule,
    animeEpisodeTarget,
    animeRelease,
    schedulerHeartbeat,
} from '@arc/shared/db/schema';
import type { ReleaseCalendarEntry } from './release-calendar-parser';
import { releaseCalendarWindow } from './release-calendar-window';

type StoredReleaseCalendarEntry = ReleaseCalendarEntry & { airingId: number };
type PersistedReleaseCalendarTarget = Omit<StoredReleaseCalendarEntry, 'airingId'>;

export function mergeReleaseCalendarEntries(
    snapshotEntries: StoredReleaseCalendarEntry[],
    persistedTargets: PersistedReleaseCalendarTarget[]
) {
    const entries = new Map(
        snapshotEntries.map((entry) => [`${entry.anilistId}:${entry.episode}`, entry])
    );

    for (const target of persistedTargets) {
        const key = `${target.anilistId}:${target.episode}`;
        const existing = entries.get(key);
        entries.set(key, {
            ...target,
            airingId:
                existing?.airingId ?? 1_000_000_000 + target.anilistId * 1_000 + target.episode,
        });
    }

    return [...entries.values()].sort(
        (left, right) => left.airingAt.getTime() - right.airingAt.getTime()
    );
}

export async function refreshReleaseCalendar(
    discover: (from: Date, to: Date) => Promise<ReleaseCalendarEntry[]>,
    now = new Date()
) {
    const { from, to } = releaseCalendarWindow(now);
    const entries = await discover(from, to);
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
    const [rows, targets, heartbeat] = await Promise.all([
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
            .select({
                anilistId: animeEpisodeTarget.anilistId,
                episode: animeEpisodeTarget.targetEpisode,
                airingAt: animeEpisodeTarget.airingAt,
                title: animeRelease.title,
                imageUrl: animeRelease.imageUrl,
            })
            .from(animeEpisodeTarget)
            .innerJoin(animeRelease, eq(animeRelease.anilistId, animeEpisodeTarget.anilistId))
            .where(
                and(
                    inArray(animeEpisodeTarget.state, ['pending', 'confirmed']),
                    gte(animeEpisodeTarget.airingAt, from),
                    lt(animeEpisodeTarget.airingAt, to)
                )
            ),
        db
            .select({ refreshedAt: schedulerHeartbeat.lastCalendarRefreshAt })
            .from(schedulerHeartbeat)
            .where(eq(schedulerHeartbeat.name, 'anime-scheduler'))
            .limit(1)
            .then((result) => result[0] ?? null),
    ]);
    const events = mergeReleaseCalendarEntries(
        rows.map((row) => ({
            airingId: row.airingId,
            anilistId: row.anilistId,
            episode: row.episode,
            airingAt: row.airingAt,
            title: row.title,
            synopsis: row.synopsis,
            imageUrl: row.imageUrl,
        })),
        targets.map((target) => ({
            ...target,
            synopsis: null,
        }))
    );

    return {
        events: events.map((row) => ({
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
