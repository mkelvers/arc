import { fail, redirect, type Actions } from '@sveltejs/kit';
import { forwardAuthForm, responseError } from '$lib/server/auth-form';

export const actions: Actions = {
    default: async ({ fetch, request, cookies }) => {
        const form = await request.formData();
        const email = String(form.get('email') ?? '').trim();
        const username = String(form.get('username') ?? '').trim();
        const password = String(form.get('password') ?? '');
        const confirmPassword = String(form.get('confirmPassword') ?? '');
        const invitationCode = String(form.get('invitationCode') ?? '').trim();

        if (!email || !username || !password || !confirmPassword || !invitationCode) {
            return fail(400, { error: 'Complete every required field.' });
        }
        if (password !== confirmPassword) {
            return fail(400, { error: 'Passwords do not match.' });
        }

        const response = await forwardAuthForm(fetch, cookies, request, '/v1/accounts', {
            email,
            username,
            password,
            invitationCode,
        });
        if (!response.ok) {
            return fail(response.status, {
                error: await responseError(
                    response,
                    'We could not create your account. Please try again.'
                ),
            });
        }

        redirect(303, '/');
    },
};
