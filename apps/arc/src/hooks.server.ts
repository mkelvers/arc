import { env } from '$env/dynamic/private';
import { redirect, type Handle } from '@sveltejs/kit';

import { SessionResponseSchema } from '@arc/core/contracts/auth';

export const handle: Handle = async ({ event, resolve }) => {
    if (!event.route.id) {
        return resolve(event);
    }

    let response: Response;
    try {
        response = await event.fetch(`${env.API_ORIGIN!}/api/auth/get-session`, {
            headers: {
                Cookie: event.request.headers.get('cookie') ?? '',
                Authorization: event.request.headers.get('authorization') ?? '',
                'X-Forwarded-For': event.getClientAddress(),
            },
            signal: AbortSignal.timeout(8_000),
        });
    } catch {
        return new Response('Arc is temporarily unavailable', { status: 503 });
    }
    if (!response.ok) {
        return new Response('Arc is temporarily unavailable', { status: 503 });
    }

    const session = SessionResponseSchema.parse(await response.json());

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
