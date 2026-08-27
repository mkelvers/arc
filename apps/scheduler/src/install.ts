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

const cronMarker = '# arc-anime-scheduler';
const cronCommand = `*/5 * * * * /usr/bin/flock -n /tmp/arc-anime-scheduler.lock /usr/bin/env -S ${process.execPath} ${worker}`;
const current = Bun.spawnSync(['crontab', '-l']);
const existing = current.exitCode === 0 ? current.stdout.toString() : '';
const withoutScheduler = existing
    .split('\n')
    .filter((line) => line !== cronMarker && !line.includes('arc-anime-scheduler'))
    .join('\n')
    .trim();
const next = [withoutScheduler, cronMarker, cronCommand].filter(Boolean).join('\n') + '\n';
const result = Bun.spawnSync(['crontab', '-'], { stdin: new TextEncoder().encode(next) });
if (result.exitCode !== 0) {
    throw new Error(`Could not install scheduler crontab: ${result.stderr.toString()}`);
}
console.info(`Installed arc-anime-scheduler using ${schedulerEnvironmentPath()}`);
