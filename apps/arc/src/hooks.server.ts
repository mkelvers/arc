import { building } from '$app/environment';
import { redirect, type Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';

import { auth } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
    if (event.url.pathname.startsWith('/api/internal/')) {
        return resolve(event);
    }

    if (
        !event.route.id &&
        event.url.pathname !== '/api/auth' &&
        !event.url.pathname.startsWith('/api/auth/')
    ) {
        return resolve(event);
    }

    if (event.url.pathname === '/api/auth' || event.url.pathname.startsWith('/api/auth/')) {
        return auth.handler(event.request);
    }

    const session = await auth.api.getSession({
        headers: event.request.headers,
    });

    if (session) {
        Object.assign(event.locals, session);
    }

    if (event.route.id?.startsWith('/api/') && !session) {
        return new Response('Unauthorized', {
            status: 401,
        });
    }

    if (event.route.id?.startsWith('/(auth)/') && session) {
        redirect(303, '/');
    }

    if (event.route.id?.startsWith('/(app)/') && !session) {
        redirect(303, '/login');
    }

    return svelteKitHandler({
        event,
        resolve,
        auth,
        building,
    });
};
