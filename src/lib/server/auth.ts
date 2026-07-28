import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { sveltekitCookies } from 'better-auth/svelte-kit';

import { db } from '$lib/server/db';
import { createArcAuth } from './auth/config';

export const auth = createArcAuth({
    database: db,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    platformPlugins: [sveltekitCookies(getRequestEvent)],
});
