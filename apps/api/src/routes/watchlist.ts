import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { WatchlistSelectionSchema, WatchlistUpdateSchema } from '@arc/api-contract/watchlist';
import {
    getWatchlistPage,
    getWatchlistState,
    getWatchlistStates,
    removeFromWatchlist,
    setWatchlistState,
} from '@arc/backend/watchlist';
import { middleware, type ApiEnvironment } from '../http';

const AnimeIdSchema = z.object({ anilistId: z.coerce.number().int().positive() });

export const watchlist = new Hono<ApiEnvironment>();

watchlist.use('*', middleware);

watchlist.get('/', zValidator('query', WatchlistSelectionSchema), async (context) =>
    context.json(await getWatchlistPage(context.get('session').user.id, context.req.valid('query')))
);

watchlist.get('/states', async (context) =>
    context.json({ entries: await getWatchlistStates(context.get('session').user.id) })
);

watchlist.get('/:anilistId', zValidator('param', AnimeIdSchema), async (context) => {
    const { anilistId } = context.req.valid('param');
    return context.json({
        animeId: anilistId,
        state: await getWatchlistState(context.get('session').user.id, anilistId),
    });
});

watchlist.put(
    '/:anilistId',
    zValidator('param', AnimeIdSchema),
    zValidator('json', WatchlistUpdateSchema),
    async (context) => {
        const { anilistId } = context.req.valid('param');
        return context.json({
            animeId: anilistId,
            state: await setWatchlistState(
                context.get('session').user.id,
                anilistId,
                context.req.valid('json').state
            ),
        });
    }
);

watchlist.delete('/:anilistId', zValidator('param', AnimeIdSchema), async (context) => {
    await removeFromWatchlist(context.get('session').user.id, context.req.valid('param').anilistId);
    return context.body(null, 204);
});
