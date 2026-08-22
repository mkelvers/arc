import { env } from '$env/dynamic/private';
import createClient from 'openapi-fetch';

import type { paths } from '@arc/api-contract/generated';
import { SessionResponseSchema } from '@arc/api-contract/auth';

export class ArcApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
        options?: ErrorOptions
    ) {
        super(message, options);
        this.name = 'ArcApiError';
    }
}

function apiOrigin() {
    const origin = env.API_ORIGIN?.trim();
    if (!origin) {
        throw new TypeError('API_ORIGIN is required');
    }
    return origin;
}

export function serverApiClient(request: Request) {
    const headers = new Headers({ Accept: 'application/json' });
    const cookie = request.headers.get('cookie');
    const authorization = request.headers.get('authorization');
    if (cookie) headers.set('cookie', cookie);
    if (authorization) headers.set('authorization', authorization);

    return createClient<paths>({ baseUrl: apiOrigin(), headers });
}

export async function getApiSession(request: Request) {
    const headers = new Headers({ Accept: 'application/json' });
    const cookie = request.headers.get('cookie');
    const authorization = request.headers.get('authorization');
    if (cookie) headers.set('cookie', cookie);
    if (authorization) headers.set('authorization', authorization);

    let response: Response;
    try {
        response = await fetch(new URL('/api/auth/get-session', apiOrigin()), {
            headers,
            signal: AbortSignal.timeout(8_000),
        });
    } catch (cause) {
        throw new ArcApiError(503, 'Authentication service is unavailable', { cause });
    }
    if (!response.ok) {
        throw new ArcApiError(503, 'Authentication service is unavailable');
    }
    return SessionResponseSchema.parse(await response.json());
}
