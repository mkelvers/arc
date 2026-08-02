import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';

import { auth } from '$lib/server/auth';

const legacyIdentityCookie = 'arc_user';

export function isPublicPage(routeId: string | null) {
    return (
        routeId === '/(app)' ||
        routeId === '/(app)/anime/[id]' ||
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

function redirect(location: string) {
    return new Response(null, {
        status: 303,
        headers: { location },
    });
}

function secure(response: Response, https: boolean) {
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set(
        'Referrer-Policy',
        'strict-origin-when-cross-origin',
    );
    response.headers.set(
        'Permissions-Policy',
        'camera=(), geolocation=(), microphone=()',
    );
    if (!response.headers.has('Content-Security-Policy')) {
        response.headers.set(
            'Content-Security-Policy',
            "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        );
    }
    if (https) {
        response.headers.set(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains',
        );
    }

    return response;
}

const route: Handle = async ({ event, resolve }) => {
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
            return redirect('/');
        }

        return resolve(event);
    }

    if (!isPublicPage(routeId) && !result) {
        return redirect('/login');
    }

    return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = async (input) =>
    secure(
        await route(input),
        input.event.url.protocol === 'https:',
    );
