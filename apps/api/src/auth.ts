import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer, username } from 'better-auth/plugins';

import { hasInvitationClaim } from '@arc/backend';
import { db } from '@arc/db';
import * as schema from '@arc/db/schema';
import { apiOrigin, authSecret, cookieDomain, webOrigin } from './config';

export const auth = betterAuth({
    appName: 'Arc',
    baseURL: apiOrigin,
    secret: authSecret,
    trustedOrigins: [webOrigin],
    database: drizzleAdapter(db, {
        provider: 'pg',
        schema,
        usePlural: true,
    }),
    advanced: {
        cookiePrefix: 'arc',
        database: { generateId: 'uuid' },
        ipAddress: { ipAddressHeaders: ['x-arc-client-ip'] },
        useSecureCookies: apiOrigin.startsWith('https://'),
        defaultCookieAttributes: {
            httpOnly: true,
            sameSite: 'lax',
            secure: apiOrigin.startsWith('https://'),
        },
        crossSubDomainCookies: cookieDomain ? { enabled: true, domain: cookieDomain } : undefined,
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
            '/sign-in/username': { window: 60, max: 5 },
        },
    },
    telemetry: { enabled: false },
    hooks: {
        before: createAuthMiddleware(async (context) => {
            if (context.path !== '/sign-up/email') {
                return;
            }
            const claim = context.headers?.get('x-arc-invitation-reservation');
            if (!claim || !(await hasInvitationClaim(claim))) {
                throw new APIError('FORBIDDEN', { message: 'A valid invitation is required.' });
            }
        }),
    },
    plugins: [username({ minUsernameLength: 3, maxUsernameLength: 30 }), bearer()],
});

export type AuthSession = typeof auth.$Infer.Session;
