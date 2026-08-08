import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import { getAccount } from '$lib/server/account';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

import { accountSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    redirect(303, '/login');
  }

  return {
    pageTitle: 'Account settings',
    account: await getAccount(locals.user.id),
  };
};

export const actions: Actions = {
  update: async ({ locals, request }) => {
    if (!locals.user) {
      redirect(303, '/login');
    }

    const values = Object.fromEntries(await request.formData());
    const result = accountSchema.safeParse(values);

    if (!result.success) {
      return fail(400, {
        message: result.error.issues[0]?.message ?? 'Check the account details.',
        values,
      });
    }

    await db
      .update(users)
      .set({
        name: result.data.accountName,
      })
      .where(eq(users.id, locals.user.id));

    return { success: true };
  },
};
