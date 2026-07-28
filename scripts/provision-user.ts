import 'dotenv/config';

import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { APIError } from 'better-auth';
import { hashPassword } from 'better-auth/crypto';
import postgres from 'postgres';

import { createArcAuth } from '../src/lib/server/auth/config';
import * as schema from '../src/lib/server/db/schema';

class MutedOutput extends Writable {
    muted = false;

    override _write(
        chunk: Buffer,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
    ) {
        if (!this.muted) {
            process.stdout.write(chunk);
        }
        callback();
    }
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('User provisioning must be run in an interactive terminal');
}
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
}

const output = new MutedOutput();
const prompt = createInterface({
    input: process.stdin,
    output,
    terminal: true,
});

async function secret(label: string) {
    process.stdout.write(label);
    output.muted = true;
    const value = await prompt.question('');
    output.muted = false;
    process.stdout.write('\n');
    return value;
}

const usernameInput =
    Bun.argv[2]?.trim() || (await prompt.question('Username: ')).trim();
const username = usernameInput.toLowerCase();
const validUsername =
    username.length >= 3 &&
    username.length <= 30 &&
    /^[a-z0-9_]+$/.test(username);

if (!validUsername) {
    prompt.close();
    throw new Error(
        'Username must be 3-30 characters using letters, numbers, or underscores',
    );
}

const password = await secret('Password: ');
const confirmation = await secret('Confirm password: ');
prompt.close();

if (password !== confirmation) {
    throw new Error('Passwords do not match');
}
if (password.length < 12 || password.length > 128) {
    throw new Error('Password must be between 12 and 128 characters');
}

const client = postgres(process.env.DATABASE_URL);
const database = drizzle({ client, schema });
const provisioningAuth = createArcAuth({
    database,
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    allowSignUp: true,
});

try {
    const [existing] = await database
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.username, username))
        .limit(1);

    if (existing) {
        const passwordHash = await hashPassword(password);

        await database.transaction(async (tx) => {
            const [credential] = await tx
                .update(schema.accounts)
                .set({
                    password: passwordHash,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(schema.accounts.userId, existing.id),
                        eq(schema.accounts.providerId, 'credential'),
                    ),
                )
                .returning({ id: schema.accounts.id });

            if (!credential) {
                throw new Error('The user has no credential account');
            }

            await tx
                .update(schema.users)
                .set({
                    name: usernameInput,
                    displayUsername: usernameInput,
                    updatedAt: new Date(),
                })
                .where(eq(schema.users.id, existing.id));
            await tx
                .delete(schema.sessions)
                .where(eq(schema.sessions.userId, existing.id));
        });
    } else {
        const created = await provisioningAuth.api.signUpEmail({
            body: {
                email: `${username}@arc.local`,
                name: usernameInput,
                password,
                username,
                displayUsername: usernameInput,
            },
        });

        await database
            .delete(schema.sessions)
            .where(eq(schema.sessions.userId, created.user.id));
    }

    console.log(`Provisioned user ${username}`);
} catch (cause) {
    if (cause instanceof APIError) {
        console.error(cause.message);
        process.exitCode = 1;
    } else {
        throw cause;
    }
} finally {
    await client.end();
}
