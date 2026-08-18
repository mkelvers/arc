#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

bun - <<'BUN'
import postgres from 'postgres';
import { hashPassword, verifyPassword } from 'better-auth/crypto';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
}

const database = new URL(databaseUrl);
if (database.hostname !== 'localhost' && database.hostname !== '127.0.0.1') {
    throw new Error(`Refusing to reset non-local database: ${database.hostname}`);
}

const username = 'admin';
const password = 'admin';
const userId = crypto.randomUUID();
const passwordHash = await hashPassword(password);

if (!(await verifyPassword({ hash: passwordHash, password }))) {
    throw new Error('Password hash verification failed');
}

const sql = postgres(databaseUrl);
await sql.begin(async (transaction) => {
    await transaction`delete from users`;
    await transaction`
        insert into users (id, name, email, email_verified, username, display_username)
        values (${userId}, ${username}, ${'admin@arc.local'}, false, ${username}, ${username})
    `;
    await transaction`
        insert into accounts (account_id, provider_id, user_id, password)
        values (${userId}, ${'credential'}, ${userId}, ${passwordHash})
    `;
});

await sql.end();
console.log('Reset local users and created admin/admin.');
BUN
