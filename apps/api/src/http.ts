import { createMiddleware } from 'hono/factory';

import { auth, type AuthSession } from './auth';

export type ApiEnvironment = {
    Variables: {
        session: AuthSession;
    };
};

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
            (origin && origin !== process.env.ARC_WEB_ORIGIN!) ||
            (cookie && origin !== process.env.ARC_WEB_ORIGIN!)
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
