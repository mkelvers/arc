import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins';

import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { hasInvitationClaim } from '$lib/server/invitations';

const trustedOrigins = (env.BETTER_AUTH_TRUSTED_ORIGINS ?? env.BETTER_AUTH_URL)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

export const auth = betterAuth({
    appName: 'Arc',
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: drizzleAdapter(db, {
        provider: 'pg',
        schema,
        usePlural: true,
    }),
    advanced: {
        cookiePrefix: 'arc',
        database: {
            generateId: 'uuid',
        },
    },
    emailAndPassword: {
        enabled: true,
        disableSignUp: false,
        minPasswordLength: 12,
        maxPasswordLength: 128,
    },
    disabledPaths: [
        '/sign-in/email',
        '/is-username-available',
        '/request-password-reset',
        '/reset-password',
    ],
    rateLimit: {
        enabled: true,
        window: 60,
        max: 100,
        customRules: {
            '/sign-in/username': {
                window: 60,
                max: 5,
            },
        },
    },
    telemetry: {
        enabled: false,
    },
    hooks: {
        before: createAuthMiddleware(async (context) => {
            if (context.path !== '/sign-up/email') {
                return;
            }

            // Only the registration action can create this opaque database claim.
            const claim = context.headers?.get('x-arc-invitation-reservation');
            if (!claim || !(await hasInvitationClaim(claim))) {
                throw new APIError('FORBIDDEN', { message: 'A valid invitation is required.' });
            }
        }),
    },
    plugins: [
        username({
            minUsernameLength: 3,
            maxUsernameLength: 30,
        }),
        sveltekitCookies(getRequestEvent),
    ],
});
