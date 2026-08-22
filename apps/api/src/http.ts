import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { z } from 'zod';

import { auth, type AuthSession } from './auth';

export type ApiEnvironment = {
    Variables: {
        session: AuthSession;
    };
};

export function validate<T extends z.ZodType, Target extends keyof ValidationTargets>(
    target: Target,
    schema: T
) {
    return zValidator(target, schema, (result, context) => {
        if (!result.success) {
            return context.json(
                {
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Request data is invalid',
                    },
                },
                400
            );
        }
    });
}

export const middleware = createMiddleware<ApiEnvironment>(async (context, next) => {
    const session = await auth.api.getSession({
        headers: context.req.raw.headers,
    });
    if (!session) {
        return context.json(
            {
                error: {
                    code: 'AUTHENTICATION_REQUIRED',
                    message: 'Authentication required',
                },
            },
            401
        );
    }

    context.set('session', session);
    await next();
});

export const origin = createMiddleware(async (context, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
        const origin = context.req.header('origin');
        const cookie = context.req.header('cookie');
        if (
            (origin && origin !== process.env.BETTER_AUTH_URL!) ||
            (cookie && origin !== process.env.BETTER_AUTH_URL!)
        ) {
            return context.json(
                {
                    error: {
                        code: 'ORIGIN_FORBIDDEN',
                        message: 'Request origin is not allowed',
                    },
                },
                403
            );
        }
    }

    await next();
});
