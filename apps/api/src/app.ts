import { Hono } from 'hono';

import { isAniKotoTransientError, TargetEpisodeUnavailableError } from '@arc/core/server';
import { GraphQLRequestError } from '@arc/shared/graphql/error';
import { logger } from '@arc/core/server';
import { auth } from './auth';
import { origin } from './http';
import { accounts } from './routes/accounts';
import { anime } from './routes/anime';
import { catalog } from './routes/catalog';
import { playback } from './routes/playback';
import { maintenance } from './routes/maintenance';
import { notifications } from './routes/notifications';
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
app.route('/v1/notifications', notifications);
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
    if (cause instanceof TargetEpisodeUnavailableError) {
        logger.debug(cause.message);
        return context.json(
            {
                error: {
                    code: 'EPISODE_UNAVAILABLE',
                    message: 'The requested episode is not available yet',
                },
            },
            503
        );
    }

    if (isAniKotoTransientError(cause)) {
        logger.error(
            `${context.req.method} ${context.req.path} failed: AniKoto is temporarily unavailable`,
            cause instanceof Error ? cause.message : String(cause)
        );
        return context.json(
            {
                error: {
                    code: 'UPSTREAM_UNAVAILABLE',
                    message: 'AniKoto is temporarily unavailable',
                },
            },
            503
        );
    }

    if (
        cause instanceof GraphQLRequestError &&
        (cause.status === 429 || cause.status === undefined || cause.status >= 500)
    ) {
        logger.error(
            `${context.req.method} ${context.req.path} failed: AniList is temporarily unavailable`,
            cause.message
        );
        return context.json(
            {
                error: {
                    code: 'UPSTREAM_UNAVAILABLE',
                    message: 'AniList is temporarily unavailable',
                },
            },
            503
        );
    }

    logger.error(
        `${context.req.method} ${context.req.path} failed: unhandled API request failure`,
        cause instanceof Error ? cause.message : String(cause)
    );
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
