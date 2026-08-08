import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';

import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { claimInvitation, completeInvitation, restoreInvitation } from '$lib/server/invitations';
import { verifyTurnstile } from '$lib/server/turnstile';

import { registerSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const schema = zod4(registerSchema);

export const load: PageServerLoad = async () => ({ form: await superValidate(schema) });

export const actions: Actions = {
  default: async (event) => {
    const form = await superValidate(event.request, schema);
    if (!form.valid) return setError(form, 'Check the highlighted account details.');

    if (
      !(await verifyTurnstile(
        form.data['cf-turnstile-response'],
        event.request.headers.get('cf-connecting-ip') ?? undefined
      ))
    ) {
      return setError(form, 'cf-turnstile-response', 'Human verification failed. Try again.');
    }

    const claim = crypto.randomUUID();
    if (!(await claimInvitation(form.data.invitationCode, claim))) {
      return setError(form, 'invitationCode', 'That invitation is invalid or already used.');
    }

    const headers = new Headers(event.request.headers);
    headers.set('x-arc-invitation-reservation', claim);

    let userId: string | undefined;
    try {
      const result = await auth.api.signUpEmail({
        headers,
        body: {
          name: form.data.username,
          email: `${form.data.username.toLowerCase()}@arc.local`,
          password: form.data.password,
          username: form.data.username,
          displayUsername: form.data.username,
        },
      });
      userId = result.user.id;
      if (!(await completeInvitation(claim, userId))) throw new Error('Invitation claim lost.');
    } catch {
      if (userId) await db.delete(users).where(eq(users.id, userId));
      await restoreInvitation(claim);
      return setError(form, 'username', 'That username is unavailable.');
    }

    redirect(303, '/');
  },
};
