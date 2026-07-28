import { building } from '$app/environment';
import { redirect, type Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';

import { auth } from '$lib/server/auth';

const legacyIdentityCookie = 'arc_user';

export function isPublicPage(routeId: string | null) {
    return (
        routeId === '/' ||
        routeId === '/anime/[id]' ||
        routeId?.startsWith('/(auth)/') === true
    );
}

function unauthorized() {
    return new Response('Unauthorized', {
        status: 401,
        headers: {
            'cache-control': 'no-store',
        },
    });
}

export const handle: Handle = async ({ event, resolve }) => {
    const routeId = event.route.id;

    event.locals.session = null;
    event.locals.user = null;

    if (event.cookies.get(legacyIdentityCookie)) {
        event.cookies.delete(legacyIdentityCookie, { path: '/' });
    }

    if (event.url.pathname.startsWith('/api/auth')) {
        return svelteKitHandler({ event, resolve, auth, building });
    }

    if (!routeId || routeId.startsWith('/api/internal/')) {
        return resolve(event);
    }

    const result = await auth.api.getSession({
        headers: event.request.headers,
    });
    event.locals.session = result?.session ?? null;
    event.locals.user = result?.user ?? null;

    if (routeId.startsWith('/api/')) {
        if (!result) {
            return unauthorized();
        }

        return resolve(event);
    }

    if (routeId?.startsWith('/(auth)/')) {
        if (result) {
            redirect(303, '/');
        }

        return resolve(event);
    }

    if (!isPublicPage(routeId) && !result) {
        redirect(303, '/login');
    }

    return svelteKitHandler({ event, resolve, auth, building });
};
