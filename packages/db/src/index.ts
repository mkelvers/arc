import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
}

export const db = drizzle({
    client: postgres(process.env.DATABASE_URL),
    schema,
});

export type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function excluded(column: { name: string }) {
    return sql.raw(`excluded."${column.name}"`);
}
