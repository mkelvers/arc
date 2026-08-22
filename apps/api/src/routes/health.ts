import { sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { db } from '@arc/db';

export const health = new Hono()
    .get('/live', (context) => context.json({ status: 'ok' }))
    .get('/ready', async (context) => {
        try {
            await db.execute(sql`select 1`);
            return context.json({ status: 'ready' });
        } catch (cause) {
            console.error('API readiness check failed', cause);
            return context.json({ status: 'unavailable' }, 503);
        }
    });
