import 'dotenv/config';

import { randomUUID } from 'node:crypto';

import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js/driver';
import postgres from 'postgres';

import * as schema from '@arc/shared/db/schema';
import { createAnimeSearchIndex } from '@arc/core';

describe('PostgreSQL anime search index', () => {
    test.skipIf(!process.env.DATABASE_URL)(
        'finds a title when the query contains a spelling mistake',
        async () => {
            const admin = postgres(process.env.DATABASE_URL!);
            const namespace = `arc_search_test_${randomUUID().replaceAll('-', '')}`;

            try {
                await admin.unsafe('create extension if not exists pg_trgm with schema public');
                await admin.unsafe(`create schema ${namespace}`);
                const sql = postgres(process.env.DATABASE_URL!, {
                    connection: {
                        search_path: `${namespace},public`,
                    },
                });

                try {
                    await sql.unsafe(`
                    create table anime_search_index (
                        anilist_id integer primary key,
                        search_text text not null,
                        data jsonb not null,
                        updated_at timestamptz not null default now()
                    )
                `);
                    const index = createAnimeSearchIndex(drizzle({ client: sql, schema }));
                    await index.store([
                        {
                            id: 132052,
                            href: '/anime/132052',
                            link: '/anime/132052',
                            title: 'A Couple of Cuckoos',
                            titles: ['A Couple of Cuckoos', 'Kakkou no Iinazuke'],
                            image: 'https://example.com/cuckoos.jpg',
                            audioLabel: '',
                            score: 68,
                            genres: ['Comedy', 'Romance'],
                            synopsis: '',
                            format: 'TV',
                            popularity: 120_000,
                            backdrop: null,
                            artworkGroup: null,
                            relatedIds: [],
                        },
                    ]);

                    const results = await index.find('a couple of cockoos');

                    expect(results.map(({ id }) => id)).toEqual([132052]);
                } finally {
                    await sql.end();
                }
            } finally {
                await admin.unsafe(`drop schema if exists ${namespace} cascade`);
                await admin.end();
            }
        }
    );
});
