import { env } from '$env/dynamic/private';
import { fail, redirect } from '@sveltejs/kit';

import { clearance, createClearance } from '$lib/server/clearance';
import { verifyTurnstile } from '$lib/server/turnstile';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
    const value = url.searchParams.get('returnTo');
    return {
        pageTitle: 'Verify',
        returnTo: value?.startsWith('/') && !value.startsWith('//') ? value : '/',
    };
};

export const actions: Actions = {
    default: async (event) => {
        if (!env.TURNSTILE_SECRET || !env.TURNSTILE_CLEARANCE_SECRET) {
            return fail(503, { message: 'Human verification is not configured.' });
        }

        const form = await event.request.formData();
        if (
            !(await verifyTurnstile(
                form.get('cf-turnstile-response'),
                event.request.headers.get('cf-connecting-ip') ?? undefined
            ))
        ) {
            return fail(400, { message: 'Human verification failed. Please try again.' });
        }

        event.cookies.set(clearance.cookie, await createClearance(env.TURNSTILE_CLEARANCE_SECRET), {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: event.url.protocol === 'https:',
            maxAge: clearance.maxAge,
        });

        const value = form.get('returnTo');
        redirect(
            303,
            typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
                ? value
                : '/'
        );
    },
};
