import { fail, redirect, type Actions } from '@sveltejs/kit';
import { forwardAuthForm, responseError } from '$lib/server/auth-form';

export const actions: Actions = {
    default: async ({ fetch, request, cookies, getClientAddress }) => {
        const form = await request.formData();
        const username = String(form.get('username') ?? '').trim();
        const password = String(form.get('password') ?? '');

        if (!username || !password) {
            return fail(400, { error: 'Enter your username and password.' });
        }

        const response = await forwardAuthForm(
            fetch,
            cookies,
            request,
            getClientAddress(),
            '/api/auth/sign-in/username',
            {
                username,
                password,
            }
        );
        if (!response.ok) {
            return fail(response.status, {
                error: await responseError(response, 'We could not log you in. Please try again.'),
            });
        }

        redirect(303, '/');
    },
};
