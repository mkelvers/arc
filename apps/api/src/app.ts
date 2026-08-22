import { OpenAPIHono } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';

import { db } from '@arc/db';
import { auth, type AuthSession } from './auth';
import { webOrigin } from './config';
import { errorBody } from './http';
import { accountRoutes } from './routes/accounts';
import { watchlistRoutes } from './routes/watchlist';

type Environment = { Variables: { session: AuthSession | null } };
const app = new OpenAPIHono<Environment>();

app.use(
    '*',
    cors({
        origin: webOrigin,
        allowHeaders: ['Accept', 'Authorization', 'Content-Type'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        exposeHeaders: ['set-auth-token'],
        credentials: true,
    })
);

app.use(
    '/v1/*',
    createMiddleware<Environment>(async (context, next) => {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
            const origin = context.req.header('origin');
            const hasCookie = Boolean(context.req.header('cookie'));
            const hasBearer = context.req.header('authorization')?.startsWith('Bearer ') ?? false;
            if (
                (origin && origin !== webOrigin) ||
                (hasCookie && origin !== webOrigin) ||
                (!origin && !hasBearer && hasCookie)
            ) {
                return context.json(
                    errorBody('ORIGIN_FORBIDDEN', 'Request origin is not allowed'),
                    403
                );
            }
        }
        const session = await auth.api.getSession({ headers: context.req.raw.headers });
        context.set('session', session);
        await next();
        context.header('Cache-Control', 'no-store');
    })
);

app.all('/api/auth/*', (context) => auth.handler(context.req.raw));
app.get('/health/live', (context) => context.json({ status: 'ok' }));
app.get('/health/ready', async (context) => {
    try {
        await db.execute(sql`select 1`);
        return context.json({ status: 'ready' });
    } catch (cause) {
        console.error('API readiness check failed', cause);
        return context.json({ status: 'unavailable' }, 503);
    }
});
app.route('/v1', accountRoutes);
app.route('/v1/watchlist', watchlistRoutes);
app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Arc API', version: '1.0.0' },
});
app.notFound((context) => context.json(errorBody('NOT_FOUND', 'Route not found'), 404));
app.onError((cause, context) => {
    console.error('Unhandled API request failure', cause);
    return context.json(errorBody('INTERNAL_ERROR', 'The request could not be completed'), 500);
});

export default app;
