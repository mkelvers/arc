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

const AnimeIdSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const watchlist = new Hono<ApiEnvironment>();

watchlist.use('*', middleware);

watchlist.get('/', zValidator('query', WatchlistSelectionSchema), async (context) =>
    context.json(await getWatchlistPage(context.get('session').user.id, context.req.valid('query')))
);

watchlist.get('/states', async (context) =>
    context.json({ entries: await getWatchlistStates(context.get('session').user.id) })
);

watchlist.get('/:anilistId', zValidator('param', AnimeIdSchema), async (context) => {
    const { id } = context.req.valid('param');
    return context.json({
        animeId: id,
        state: await getWatchlistState(context.get('session').user.id, id),
    });
});

watchlist.put(
    '/:anilistId',
    zValidator('param', AnimeIdSchema),
    zValidator('json', WatchlistUpdateSchema),
    async (context) => {
        const { id } = context.req.valid('param');
        return context.json({
            animeId: id,
            state: await setWatchlistState(
                context.get('session').user.id,
                id,
                context.req.valid('json').state
            ),
        });
    }
);

watchlist.delete('/:anilistId', zValidator('param', AnimeIdSchema), async (context) => {
    await removeFromWatchlist(context.get('session').user.id, context.req.valid('param').id);
    return context.body(null, 204);
});
