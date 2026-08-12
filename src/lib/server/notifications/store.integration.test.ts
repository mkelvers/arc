import 'dotenv/config';

import { randomUUID } from 'node:crypto';

import { describe, expect, test } from 'bun:test';
import { asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '$lib/server/db/schema';
import type { NotificationEventInput } from './events';
import { persistNotificationEvents } from './persist';

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

async function withNotificationStore(
    run: (context: {
        database: ReturnType<typeof drizzle<typeof schema>>;
        sql: ReturnType<typeof postgres>;
    }) => Promise<void>
) {
    const admin = postgres(process.env.DATABASE_URL!);
    const namespace = `arc_notification_test_${randomUUID().replaceAll('-', '')}`;

    try {
        await admin.unsafe(`create schema ${namespace}`);
        const sql = postgres(process.env.DATABASE_URL!, {
            connection: { search_path: namespace },
        });

        try {
            await sql.unsafe(`
                create type episode_audio as enum ('sub', 'dub', 'raw');
                create type notification_kind as enum (
                    'season_announced', 'season_available', 'episode_available', 'audio_available'
                );
                create table notification (
                    id uuid primary key default gen_random_uuid(),
                    user_id uuid not null,
                    kind notification_kind not null,
                    anilist_id integer not null,
                    source_anilist_id integer not null,
                    title text not null,
                    episode_id text,
                    episode_number double precision,
                    audio episode_audio[] not null default '{}',
                    dedupe_key text not null,
                    occurred_at timestamptz,
                    created_at timestamptz not null default now(),
                    read_at timestamptz,
                    dismissed_at timestamptz,
                    unique (user_id, dedupe_key)
                )
            `);
            await run({ database: drizzle({ client: sql, schema }), sql });
        } finally {
            await sql.end();
        }
    } finally {
        await admin.unsafe(`drop schema if exists ${namespace} cascade`);
        await admin.end();
    }
}

function event(overrides: Partial<NotificationEventInput> = {}): NotificationEventInput {
    return {
        userId: '00000000-0000-4000-8000-000000000001',
        kind: 'episode_available',
        anilistId: 20,
        sourceAnilistId: 10,
        title: 'Sequel',
        episodeId: 'episode-7',
        episodeNumber: 7,
        audio: ['sub'],
        dedupeKey: 'episode_available:20:episode-7',
        occurredAt: new Date('2026-08-12T12:00:00.000Z'),
        ...overrides,
    };
}

describe('PostgreSQL notification durability', () => {
    databaseTest('stores one row across repeated and concurrent delivery attempts', async () => {
        await withNotificationStore(async ({ database, sql }) => {
            const attempts = await Promise.all([
                persistNotificationEvents([event()], database),
                persistNotificationEvents([event()], database),
                persistNotificationEvents([event()], database),
            ]);
            const rows = await sql`select kind, dedupe_key from notification`;

            expect(attempts.reduce((total, created) => total + created.length, 0)).toBe(1);
            expect(rows.map(({ kind, dedupe_key }) => ({ kind, dedupe_key }))).toEqual([
                {
                    kind: 'episode_available',
                    dedupe_key: 'episode_available:20:episode-7',
                },
            ]);
        });
    });

    databaseTest('keeps a later dub distinct from the episode event', async () => {
        await withNotificationStore(async ({ database }) => {
            await persistNotificationEvents([event()], database);
            await persistNotificationEvents(
                [
                    event({
                        kind: 'audio_available',
                        audio: ['dub'],
                        dedupeKey: 'audio_available:20:episode-7:dub',
                    }),
                ],
                database
            );
            const rows = await database
                .select({ kind: schema.notification.kind, audio: schema.notification.audio })
                .from(schema.notification)
                .orderBy(asc(schema.notification.kind));

            expect(rows).toEqual([
                { kind: 'episode_available', audio: ['sub'] },
                { kind: 'audio_available', audio: ['dub'] },
            ]);
        });
    });

    databaseTest(
        'rolls notification creation back with its owning inventory transaction',
        async () => {
            await withNotificationStore(async ({ database, sql }) => {
                await expect(
                    database.transaction(async (tx) => {
                        await persistNotificationEvents([event()], tx);
                        throw new Error('inventory update failed');
                    })
                ).rejects.toThrow('inventory update failed');

                expect(await sql`select 1 from notification`).toHaveLength(0);
            });
        }
    );
});
