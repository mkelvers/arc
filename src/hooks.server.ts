import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { redirect, type Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';

import { auth } from '$lib/server/auth';
import { clearance, verifyClearance } from '$lib/server/clearance';

export const handle: Handle = async ({ event, resolve }) => {
    if (event.route.id === '/(auth)/verify' || event.url.pathname.startsWith('/api/internal/')) {
        return resolve(event);
    }

    if (
        !event.route.id &&
        event.url.pathname !== '/api/auth' &&
        !event.url.pathname.startsWith('/api/auth/')
    ) {
        return resolve(event);
    }

    if (
        !(await verifyClearance(
            event.cookies.get(clearance.cookie),
            env.TURNSTILE_CLEARANCE_SECRET
        ))
    ) {
        event.cookies.delete(clearance.cookie, { path: '/' });

        if (event.url.pathname.startsWith('/api/')) {
            return new Response('Human verification required', {
                status: 403,
            });
        }

        redirect(
            303,
            `/verify?returnTo=${encodeURIComponent(event.url.pathname + event.url.search)}`
        );
    }

    if (event.url.pathname === '/api/auth' || event.url.pathname.startsWith('/api/auth/')) {
        return svelteKitHandler({
            event,
            resolve,
            auth,
            building,
        });
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
