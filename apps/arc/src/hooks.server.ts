import { redirect, type Handle } from '@sveltejs/kit';

import { ArcApiError, getApiSession } from '$lib/server/api-client';

export const handle: Handle = async ({ event, resolve }) => {
    if (!event.route.id) {
        return resolve(event);
    }
    let session;
    try {
        session = await getApiSession(event.request);
    } catch (cause) {
        if (cause instanceof ArcApiError) {
            return new Response('Arc is temporarily unavailable', { status: cause.status });
        }
        throw cause;
    }

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

    if ((event.route.id === '/(app)' || event.route.id?.startsWith('/(app)/')) && !session) {
        redirect(303, '/login');
    }

    return resolve(event);
};
