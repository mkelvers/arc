import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';

import { loadSchedulerConfig, schedulerEnvironmentPath } from './config';

loadSchedulerConfig();
const { db } = await import('@arc/db');

try {
    await db.execute(sql`select 1`);
} catch (cause) {
    throw new Error('Scheduler PostgreSQL connectivity check failed', { cause });
}

const worker = resolve(import.meta.dir, '../dist/worker.js');
if (!(await Bun.file(worker).exists())) {
    throw new Error(`Compiled scheduler worker does not exist at ${worker}`);
}

await Bun.cron(worker, '*/5 * * * *', 'arc-anime-scheduler');
console.info(`Installed arc-anime-scheduler using ${schedulerEnvironmentPath()}`);
