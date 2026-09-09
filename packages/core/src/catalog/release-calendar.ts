import { asc, and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@arc/shared/db';
import {
    animeAiringSchedule,
    animeEpisodeTarget,
    animeRelease,
    schedulerHeartbeat,
} from '@arc/shared/db/schema';
import { plainText } from './anilist-text';
import type { ReleaseCalendarEntry } from './release-calendar-parser';
import { releaseCalendarWindow } from './release-calendar-window';

type StoredReleaseCalendarEntry = ReleaseCalendarEntry & { airingId: number };
type PersistedReleaseCalendarTarget = Omit<StoredReleaseCalendarEntry, 'airingId'>;
const releaseSynopsisDataSchema = z.looseObject({
    description: z.string().nullable().optional(),
});
type ReleaseSynopsisData = z.output<typeof releaseSynopsisDataSchema>;

export function persistedReleaseSynopsis(data: ReleaseSynopsisData | null) {
    if (!data?.description) {
        return null;
    }

    return plainText(data.description) || null;
}

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
            ...existing,
            ...target,
            synopsis: target.synopsis ?? existing?.synopsis ?? null,
            imageUrl: target.imageUrl ?? existing?.imageUrl ?? null,
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
        if (entries.length) {
            await tx
                .insert(animeAiringSchedule)
                .values(
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
                )
                .onConflictDoUpdate({
                    target: animeAiringSchedule.airingId,
                    set: {
                        anilistId: sql.raw(`excluded."${animeAiringSchedule.anilistId.name}"`),
                        episode: sql.raw(`excluded."${animeAiringSchedule.episode.name}"`),
                        airingAt: sql.raw(`excluded."${animeAiringSchedule.airingAt.name}"`),
                        title: sql.raw(`excluded."${animeAiringSchedule.title.name}"`),
                        synopsis: sql.raw(`excluded."${animeAiringSchedule.synopsis.name}"`),
                        imageUrl: sql.raw(`excluded."${animeAiringSchedule.imageUrl.name}"`),
                        sourceFetchedAt: sql.raw(
                            `excluded."${animeAiringSchedule.sourceFetchedAt.name}"`
                        ),
                    },
                });
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
                data: animeRelease.data,
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
        targets.map(({ data, ...target }) => {
            const parsed = releaseSynopsisDataSchema.safeParse(data);
            return {
                ...target,
                synopsis: persistedReleaseSynopsis(parsed.success ? parsed.data : null),
            };
        })
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
