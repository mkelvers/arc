import { redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    redirect(303, '/login');
  }

  const userId = locals.user.id;
  const anilistAccount = await db.query.accounts.findFirst({
    columns: { id: true },
    where: (account, { and, eq }) =>
      and(eq(account.userId, userId), eq(account.providerId, 'anilist')),
  });
  return { anilistConnected: Boolean(anilistAccount) };
};

export const actions: Actions = {
  disconnect: async ({ locals }) => {
    if (!locals.user) {
      redirect(303, '/login');
    }

    const userId = locals.user.id;
    await db
      .delete(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'anilist')));

    return { success: true };
  },
};
