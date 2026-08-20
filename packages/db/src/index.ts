import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

export { excluded } from './sql';

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
}

export const db = drizzle({
    client: postgres(process.env.DATABASE_URL),
    schema,
});

export type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
