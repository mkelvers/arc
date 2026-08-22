import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { auth } from './auth';
import { origin } from './http';
import { accounts } from './routes/accounts';
import { health } from './routes/health';
import { watchlist } from './routes/watchlist';

const app = new Hono();

app.use(
    '*',
    cors({
        origin: process.env.ARC_WEB_ORIGIN!,
        allowHeaders: ['Accept', 'Authorization', 'Content-Type'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        exposeHeaders: ['set-auth-token'],
        credentials: true,
    })
);
app.use('/v1/*', origin);
app.use('/v1/*', async (context, next) => {
    await next();
    context.header('Cache-Control', 'no-store');
});

app.all('/api/auth/*', (context) => auth.handler(context.req.raw));
app.route('/health', health);
app.route('/v1/accounts', accounts);
app.route('/v1/watchlist', watchlist);
app.notFound((context) =>
    context.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404)
);
app.onError((cause, context) => {
    console.error('Unhandled API request failure', cause);
    return context.json(
        {
            error: {
                code: 'INTERNAL_ERROR',
                message: 'The request could not be completed',
            },
        },
        500
    );
});

export default app;
