import { createHash, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';

import { AccountRegistrationResponseSchema } from '@arc/api-contract/account';
import { ApiErrorSchema } from '@arc/api-contract/auth';
import {
    WatchlistStateResponseSchema,
    WatchlistStatesResponseSchema,
} from '@arc/api-contract/watchlist';
import type { db as ArcDatabase } from '@arc/db';
import type * as ArcSchema from '@arc/db/schema';
import type arcApp from './app';

const databaseAvailable = Boolean(process.env.DATABASE_URL);
const origin = 'http://localhost:5173';

describe.skipIf(!databaseAvailable)('Arc API authentication and watchlist routes', () => {
    let app: typeof arcApp;
    let db: typeof ArcDatabase;
    let schema: typeof ArcSchema;
    const invitationIds: string[] = [];
    const userIds: string[] = [];
    const username = `api_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const password = 'correct horse battery staple';
    const invitationCode = randomUUID();
    const testAnimeId = 1_700_000_000 + Math.floor(Math.random() * 100_000_000);

    beforeAll(async () => {
        process.env.BETTER_AUTH_URL ??= 'http://localhost:3001';
        process.env.BETTER_AUTH_SECRET ??= 'arc-api-integration-test-secret-at-least-32-chars';
        process.env.ARC_WEB_ORIGIN = origin;
        ({ db } = await import('@arc/db'));
        schema = await import('@arc/db/schema');
        ({ default: app } = await import('./app'));
        const [invitation] = await db
            .insert(schema.invitations)
            .values({ codeHash: createHash('sha256').update(invitationCode).digest('hex') })
            .returning({ id: schema.invitations.id });
        if (invitation) invitationIds.push(invitation.id);
    });

    afterAll(async () => {
        if (!db || !schema) return;
        if (userIds.length) await db.delete(schema.users).where(inArray(schema.users.id, userIds));
        if (invitationIds.length) {
            await db
                .delete(schema.invitations)
                .where(inArray(schema.invitations.id, invitationIds));
        }
        const external = await db
            .select({ id: schema.animeExternalId.id })
            .from(schema.animeExternalId)
            .where(eq(schema.animeExternalId.externalId, testAnimeId));
        if (external.length) {
            const links = await db
                .select({ animeId: schema.animeExternalIdLink.animeId })
                .from(schema.animeExternalIdLink)
                .where(
                    inArray(
                        schema.animeExternalIdLink.externalIdId,
                        external.map(({ id }) => id)
                    )
                );
            await db.delete(schema.animeExternalId).where(
                inArray(
                    schema.animeExternalId.id,
                    external.map(({ id }) => id)
                )
            );
            if (links.length) {
                await db.delete(schema.anime).where(
                    inArray(
                        schema.anime.id,
                        links.map(({ animeId }) => animeId)
                    )
                );
            }
        }
    });

    async function invitation() {
        const code = randomUUID();
        const [created] = await db
            .insert(schema.invitations)
            .values({ codeHash: createHash('sha256').update(code).digest('hex') })
            .returning({ id: schema.invitations.id });
        if (created) invitationIds.push(created.id);
        return code;
    }

    test('enforces registration, cookie and bearer auth, CORS, origin, and schemas', async () => {
        const invalid = await app.request('/v1/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: origin },
            body: JSON.stringify({ username: 'x', password: 'short', invitationCode: '' }),
        });
        expect(invalid.status).toBe(400);
        expect(ApiErrorSchema.parse(await invalid.json()).error.code).toBe('INVALID_REQUEST');

        const registered = await app.request('/v1/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: origin },
            body: JSON.stringify({ username, password, invitationCode }),
        });
        expect(registered.status).toBe(201);
        const account = AccountRegistrationResponseSchema.parse(await registered.json());
        userIds.push(account.user.id);
        const cookies = registered.headers.getSetCookie();
        const cookie = cookies.map((value) => value.split(';', 1)[0]).join('; ');
        const tokenCookie = cookies.find((value) => value.includes('session_token='));
        const token = tokenCookie?.match(/session_token=([^;]+)/)?.[1];
        expect(cookie).toContain('session_token=');
        expect(token).toBeTruthy();

        const reused = await app.request('/v1/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: origin },
            body: JSON.stringify({ username: `${username}_2`, password, invitationCode }),
        });
        expect(reused.status).toBe(400);
        expect(ApiErrorSchema.parse(await reused.json()).error.code).toBe('INVITATION_INVALID');

        const conflictCode = await invitation();
        const conflict = await app.request('/v1/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: origin },
            body: JSON.stringify({ username, password, invitationCode: conflictCode }),
        });
        expect(conflict.status).toBe(409);
        expect(ApiErrorSchema.parse(await conflict.json()).error.code).toBe('USERNAME_TAKEN');

        const unauthorized = await app.request('/v1/watchlist/states');
        expect(unauthorized.status).toBe(401);

        const forbidden = await app.request(`/v1/watchlist/${testAnimeId}`, {
            method: 'PUT',
            headers: {
                Cookie: cookie,
                'Content-Type': 'application/json',
                Origin: 'https://attacker.example',
            },
            body: JSON.stringify({ state: 'watching' }),
        });
        expect(forbidden.status).toBe(403);

        const updated = await app.request(`/v1/watchlist/${testAnimeId}`, {
            method: 'PUT',
            headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: origin },
            body: JSON.stringify({ state: 'watching' }),
        });
        expect(updated.status).toBe(200);
        expect(WatchlistStateResponseSchema.parse(await updated.json())).toEqual({
            animeId: testAnimeId,
            state: 'watching',
        });
        expect(updated.headers.get('cache-control')).toBe('no-store');

        const bearer = await app.request('/v1/watchlist/states', {
            headers: { Authorization: `Bearer ${decodeURIComponent(token!)}` },
        });
        expect(bearer.status).toBe(200);
        expect(WatchlistStatesResponseSchema.parse(await bearer.json()).entries).toEqual([
            { animeId: testAnimeId, state: 'watching' },
        ]);

        const preflight = await app.request('/v1/watchlist/states', {
            method: 'OPTIONS',
            headers: {
                Origin: origin,
                'Access-Control-Request-Method': 'GET',
            },
        });
        expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);
        expect(preflight.headers.get('access-control-allow-credentials')).toBe('true');
    });
});
