import { redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
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

export const load: PageServerLoad = async () => ({
    pageTitle: 'Create account',
    form: await superValidate(schema),
});

export const actions: Actions = {
    default: async (event) => {
        const form = await superValidate(event.request, schema);
        if (!form.valid) {
            return setError(form, 'Check the highlighted account details.');
        }

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
        let invitationCompletionFailed = false;
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
            if (!(await completeInvitation(claim, userId))) {
                invitationCompletionFailed = true;
                throw new Error('Invitation completion failed');
            }
        } catch (cause) {
            if (userId) {
                try {
                    await db.delete(users).where(eq(users.id, userId));
                } catch {
                    // Keep the registration response useful even if cleanup is unavailable.
                }
            }

            try {
                await restoreInvitation(claim);
            } catch {
                // Keep the registration response useful even if cleanup is unavailable.
            }

            if (
                isAPIError(cause) &&
                (cause.body?.code === 'USERNAME_IS_ALREADY_TAKEN' ||
                    cause.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL')
            ) {
                return setError(
                    form,
                    'username',
                    'That username is already in use. Choose another.'
                );
            }

            if (invitationCompletionFailed) {
                return setError(
                    form,
                    'We could not finish setting up your invitation. Please contact the administrator.'
                );
            }

            return setError(form, 'We could not create your account. Please try again.');
        }

        redirect(303, '/');
    },
};
