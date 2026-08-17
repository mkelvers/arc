import 'dotenv/config';

import { randomUUID } from 'node:crypto';

import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '$lib/server/db/schema';
import { createEpisodeRefreshQueue } from './episode-refresh';

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

async function withQueue(
    run: (context: {
        queue: ReturnType<typeof createEpisodeRefreshQueue>;
        sql: ReturnType<typeof postgres>;
    }) => Promise<void>
) {
    const admin = postgres(process.env.DATABASE_URL!);
    const namespace = `arc_refresh_test_${randomUUID().replaceAll('-', '')}`;

    try {
        await admin.unsafe(`create schema ${namespace}`);
        const sql = postgres(process.env.DATABASE_URL!, {
            connection: { search_path: namespace },
        });

        try {
            await sql.unsafe(`
                create table anime_episode_refresh (
                    anilist_id integer not null,
                    target_episode integer not null,
                    run_at timestamptz not null,
                    first_scheduled_at timestamptz not null default now(),
                    attempts integer not null default 0,
                    lease_until timestamptz,
                    retired_at timestamptz,
                    last_error text,
                    primary key (anilist_id, target_episode)
                )
            `);
            const database = drizzle({ client: sql, schema });
            await run({ queue: createEpisodeRefreshQueue(database), sql });
        } finally {
            await sql.end();
        }
    } finally {
        await admin.unsafe(`drop schema if exists ${namespace} cascade`);
        await admin.end();
    }
}

describe('PostgreSQL episode refresh lifecycle', () => {
    databaseTest('deduplicates the same refresh target and keeps the earliest run time', async () => {
        await withQueue(async ({ queue, sql }) => {
            await queue.schedule([
                {
                    anilistId: 1,
                    targetEpisode: 2,
                    runAt: new Date('2026-08-17T12:00:00Z'),
                },
                {
                    anilistId: 1,
                    targetEpisode: 2,
                    runAt: new Date('2026-08-17T11:00:00Z'),
                },
                {
                    anilistId: 1,
                    targetEpisode: 2,
                    runAt: new Date('2026-08-17T13:00:00Z'),
                },
            ]);

            const rows = await sql`
                select anilist_id, target_episode, run_at
                from anime_episode_refresh
            `;

            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({ anilist_id: 1, target_episode: 2 });
            expect(new Date(rows[0].run_at).toISOString()).toBe('2026-08-17T11:00:00.000Z');
        });
    });

    databaseTest('claims a row only once across concurrent drainers', async () => {
        await withQueue(async ({ queue }) => {
            await queue.schedule([{ anilistId: 1, targetEpisode: 2, runAt: new Date(0) }]);
            let refreshes = 0;

            const results = await Promise.all([
                queue.drain(async () => {
                    refreshes += 1;
                    await Bun.sleep(50);
                    return true;
                }),
                queue.drain(async () => {
                    refreshes += 1;
                    return true;
                }),
            ]);

            expect(refreshes).toBe(1);
            expect(results.reduce((total, result) => total + result.claimed, 0)).toBe(1);
        });
    });

    databaseTest('recovers expired leases, retries, and eventually retires work', async () => {
        await withQueue(async ({ queue, sql }) => {
            await sql`
                insert into anime_episode_refresh (
                    anilist_id, target_episode, run_at, first_scheduled_at, attempts, lease_until
                ) values (
                    2, 3, now() - interval '1 hour', now() - interval '1 day', 0,
                    now() - interval '1 minute'
                )
            `;

            const retried = await queue.drain(async () => false);
            const [retry] = await sql`
                select attempts, run_at > now() as scheduled_later, lease_until
                from anime_episode_refresh where anilist_id = 2
            `;

            expect(retried).toEqual({ claimed: 1, refreshed: 0, retried: 1, retired: 0 });
            expect(retry).toMatchObject({ attempts: 1, scheduled_later: true, lease_until: null });

            await sql`
                update anime_episode_refresh
                set run_at = now() - interval '1 minute', attempts = 11
                where anilist_id = 2
            `;
            const retired = await queue.drain(async () => false);
            const [retirement] = await sql`
                select retired_at is not null as retired, lease_until
                from anime_episode_refresh where anilist_id = 2
            `;

            expect(retired).toEqual({ claimed: 1, refreshed: 0, retried: 0, retired: 1 });
            expect(retirement).toMatchObject({ retired: true, lease_until: null });
        });
    });

    databaseTest('honors the time budget and concurrency limit', async () => {
        await withQueue(async ({ queue, sql }) => {
            await sql`
                insert into anime_episode_refresh (anilist_id, target_episode, run_at)
                select id, 1, now() - interval '1 minute'
                from generate_series(10, 15) id
            `;
            let active = 0;
            let maximumActive = 0;

            const result = await queue.drain(
                async () => {
                    active += 1;
                    maximumActive = Math.max(maximumActive, active);
                    await Bun.sleep(1_100);
                    active -= 1;
                    return true;
                },
                { concurrency: 2, timeBudgetMs: 1_000 }
            );
            const remaining = await sql`select 1 from anime_episode_refresh`;

            expect(result.claimed).toBe(2);
            expect(maximumActive).toBe(2);
            expect(remaining).toHaveLength(4);
        });
    });

    databaseTest('does not reactivate retired work during later scans', async () => {
        await withQueue(async ({ queue, sql }) => {
            await sql`
                insert into anime_episode_refresh (
                    anilist_id, target_episode, run_at, attempts, retired_at
                ) values (20, 1, now() - interval '1 day', 12, now())
            `;

            await queue.schedule([{ anilistId: 20, targetEpisode: 1, runAt: new Date(0) }]);
            const result = await queue.drain(async () => true);
            const rows = await sql`select 1 from anime_episode_refresh where anilist_id = 20`;

            expect(result.claimed).toBe(0);
            expect(rows).toHaveLength(1);
        });
    });

    databaseTest('prunes work that is no longer relevant to any user', async () => {
        await withQueue(async ({ queue, sql }) => {
            await queue.schedule([
                { anilistId: 30, targetEpisode: 1, runAt: new Date(0) },
                { anilistId: 31, targetEpisode: 1, runAt: new Date(0) },
            ]);
            await sql`
                insert into anime_episode_refresh (
                    anilist_id, target_episode, run_at, retired_at
                ) values (32, 1, now() - interval '100 days', now() - interval '100 days')
            `;

            await queue.prune([31, 32]);
            const rows = await sql`
                select anilist_id from anime_episode_refresh order by anilist_id
            `;

            expect(rows.map(({ anilist_id }) => anilist_id)).toEqual([31]);
        });
    });
});
