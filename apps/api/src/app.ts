import { Hono } from 'hono';

import { auth } from './auth';
import { origin } from './http';
import { accounts } from './routes/accounts';
import { anime } from './routes/anime';
import { catalog } from './routes/catalog';
import { playback } from './routes/playback';
import { maintenance } from './routes/maintenance';
import { watchlist } from './routes/watchlist';

const app = new Hono();

app.get('/health', (context) => context.json({ status: 'ok' }));
app.use('/v1/*', async (context, next) => {
    await next();
    context.header('Cache-Control', 'no-store');
});
app.use('/v1/*', origin);

app.all('/api/auth/*', (context) => auth.handler(context.req.raw));
app.route('/v1/internal/maintenance', maintenance);
app.route('/v1/accounts', accounts);
app.route('/v1/anime', anime);
app.route('/v1', catalog);
app.route('/v1', playback);
app.route('/v1/watchlist', watchlist);
app.notFound((context) =>
    context.json(
        {
            error: {
                code: 'NOT_FOUND',
                message: 'Route not found',
            },
        },
        404
    )
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
