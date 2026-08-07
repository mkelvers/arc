import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins';

import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';

export const auth = betterAuth({
  appName: 'Arc',
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.BETTER_AUTH_URL],
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
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  disabledPaths: [
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
    sveltekitCookies(getRequestEvent),
  ],
});
