import {
    betterAuth,
    type BetterAuthPlugin,
} from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins';

import type { db } from '../db';
import * as schema from '../db/schema';

interface ArcAuthOptions {
    database: typeof db;
    baseURL: string | undefined;
    secret: string | undefined;
    allowSignUp?: boolean;
    platformPlugins?: BetterAuthPlugin[];
}

function authOrigin(baseURL: string | undefined) {
    if (!baseURL) {
        throw new Error('BETTER_AUTH_URL is not configured');
    }

    const url = new URL(baseURL);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('BETTER_AUTH_URL must use HTTP or HTTPS');
    }

    const local =
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname === '[::1]';
    if (url.protocol !== 'https:' && !local) {
        throw new Error('BETTER_AUTH_URL must use HTTPS outside local development');
    }

    return url.origin;
}

function authSecret(secret: string | undefined) {
    if (!secret || secret.length < 32) {
        throw new Error('BETTER_AUTH_SECRET must be at least 32 characters');
    }

    return secret;
}

export function createArcAuth({
    database,
    baseURL,
    secret,
    allowSignUp = false,
    platformPlugins = [],
}: ArcAuthOptions) {
    const origin = authOrigin(baseURL);

    return betterAuth({
        appName: 'Arc',
        baseURL: origin,
        secret: authSecret(secret),
        trustedOrigins: [origin],
        database: drizzleAdapter(database, {
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
            disableSignUp: !allowSignUp,
            minPasswordLength: 12,
            maxPasswordLength: 128,
        },
        disabledPaths: allowSignUp
            ? []
            : [
                  '/sign-up/email',
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
        plugins: [
            username({
                minUsernameLength: 3,
                maxUsernameLength: 30,
            }),
            ...platformPlugins,
        ],
    });
}
