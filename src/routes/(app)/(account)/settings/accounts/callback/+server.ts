import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { enqueueAniListPublication } from '$lib/server/sync/queue';
import type { RequestHandler } from './$types';

const tokenResponseSchema = z.object({
    access_token: z.string().min(1),
    expires_in: z.number().int().positive().optional(),
});
const viewerResponseSchema = z.object({
    data: z.object({
        Viewer: z.object({
            id: z.number().int().positive(),
        }),
    }),
});

export const GET: RequestHandler = async ({ cookies, locals, url }) => {
    if (!locals.user) {
        redirect(303, '/login');
    }

    const userId = locals.user.id;

    const state = url.searchParams.get('state');
    const expectedState = cookies.get('arc_anilist_oauth_state');
    cookies.delete('arc_anilist_oauth_state', { path: '/settings/accounts' });

    if (!state || !expectedState || state !== expectedState) {
        redirect(303, '/settings/accounts?anilist=error');
    }

    const code = url.searchParams.get('code');
    if (
        !code ||
        !env.ANILIST_CLIENT_ID ||
        !env.ANILIST_CLIENT_SECRET ||
        !env.ANILIST_REDIRECT_URI
    ) {
        redirect(303, '/settings/accounts?anilist=error');
    }

    const tokenResponse = await fetch('https://anilist.co/api/v2/oauth/token', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: env.ANILIST_CLIENT_ID,
            client_secret: env.ANILIST_CLIENT_SECRET,
            redirect_uri: env.ANILIST_REDIRECT_URI,
            code,
        }),
        signal: AbortSignal.timeout(8_000),
    });

    if (!tokenResponse.ok) {
        redirect(303, '/settings/accounts?anilist=error');
    }

    const token = tokenResponseSchema.safeParse(await tokenResponse.json());
    if (!token.success) {
        redirect(303, '/settings/accounts?anilist=error');
    }

    const viewerResponse = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token.data.access_token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query: 'query { Viewer { id } }',
        }),
        signal: AbortSignal.timeout(8_000),
    });

    if (!viewerResponse.ok) {
        redirect(303, '/settings/accounts?anilist=error');
    }

    const viewer = viewerResponseSchema.safeParse(await viewerResponse.json());
    if (!viewer.success) {
        redirect(303, '/settings/accounts?anilist=error');
    }

    const values = {
        accountId: String(viewer.data.data.Viewer.id),
        accessToken: token.data.access_token,
        accessTokenExpiresAt: token.data.expires_in
            ? new Date(Date.now() + token.data.expires_in * 1_000)
            : null,
        updatedAt: new Date(),
    };
    const existing = await db.query.accounts.findFirst({
        columns: { id: true },
        where: (account, { and, eq }) =>
            and(eq(account.userId, userId), eq(account.providerId, 'anilist')),
    });

    if (existing) {
        await db.update(accounts).set(values).where(eq(accounts.id, existing.id));
    } else {
        await db.insert(accounts).values({
            ...values,
            providerId: 'anilist',
            userId,
        });
    }

    void enqueueAniListPublication(userId).catch((cause) =>
        console.warn('AniList publication enqueue failed', cause)
    );

    redirect(303, '/settings/accounts?anilist=connected');
};
