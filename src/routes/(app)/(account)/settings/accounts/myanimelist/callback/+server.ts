import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

const stateCookie = 'arc_myanimelist_oauth_state';
const verifierCookie = 'arc_myanimelist_oauth_verifier';
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});
const userResponseSchema = z.object({
  id: z.number().int().positive(),
});

export const GET: RequestHandler = async ({ cookies, locals, url }) => {
  if (!locals.user) {
    redirect(303, '/login');
  }

  const state = url.searchParams.get('state');
  const expectedState = cookies.get(stateCookie);
  const verifier = cookies.get(verifierCookie);
  cookies.delete(stateCookie, { path: '/settings/accounts' });
  cookies.delete(verifierCookie, { path: '/settings/accounts' });

  if (!state || !expectedState || state !== expectedState || !verifier) {
    redirect(303, '/settings/accounts?myanimelist=error');
  }

  const code = url.searchParams.get('code');
  if (
    !code ||
    !env.MYANIMELIST_CLIENT_ID ||
    !env.MYANIMELIST_CLIENT_SECRET ||
    !env.MYANIMELIST_REDIRECT_URI
  ) {
    redirect(303, '/settings/accounts?myanimelist=error');
  }

  const tokenResponse = await fetch('https://myanimelist.net/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MYANIMELIST_CLIENT_ID,
      client_secret: env.MYANIMELIST_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.MYANIMELIST_REDIRECT_URI,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!tokenResponse.ok) {
    redirect(303, '/settings/accounts?myanimelist=error');
  }

  const token = tokenResponseSchema.safeParse(await tokenResponse.json());
  if (!token.success) {
    redirect(303, '/settings/accounts?myanimelist=error');
  }

  const userResponse = await fetch('https://api.myanimelist.net/v2/users/@me', {
    headers: { Authorization: `Bearer ${token.data.access_token}` },
    signal: AbortSignal.timeout(8_000),
  });

  if (!userResponse.ok) {
    redirect(303, '/settings/accounts?myanimelist=error');
  }

  const user = userResponseSchema.safeParse(await userResponse.json());
  if (!user.success) {
    redirect(303, '/settings/accounts?myanimelist=error');
  }

  const userId = locals.user.id;
  const values = {
    accountId: String(user.data.id),
    accessToken: token.data.access_token,
    refreshToken: token.data.refresh_token,
    accessTokenExpiresAt: new Date(Date.now() + token.data.expires_in * 1_000),
    updatedAt: new Date(),
  };
  const existing = await db.query.accounts.findFirst({
    columns: { id: true },
    where: (account, { and, eq }) =>
      and(eq(account.userId, userId), eq(account.providerId, 'myanimelist')),
  });

  if (existing) {
    await db.update(accounts).set(values).where(eq(accounts.id, existing.id));
  } else {
    await db.insert(accounts).values({ ...values, providerId: 'myanimelist', userId });
  }

  redirect(303, '/settings/accounts?myanimelist=connected');
};
