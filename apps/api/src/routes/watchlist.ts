import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';

import { ApiErrorSchema } from '@arc/api-contract/auth';
import {
    WatchlistPageResponseSchema,
    WatchlistSelectionSchema,
    WatchlistStateResponseSchema,
    WatchlistStatesResponseSchema,
    WatchlistUpdateSchema,
} from '@arc/api-contract/watchlist';
import {
    getWatchlistPage,
    getWatchlistState,
    getWatchlistStates,
    removeFromWatchlist,
    setWatchlistState,
} from '@arc/backend/watchlist';
import type { AuthSession } from '../auth';
import { errorBody } from '../http';

type Environment = { Variables: { session: AuthSession | null } };
const animeId = z.object({ anilistId: z.coerce.number().int().positive() });
const unauthorized = {
    description: 'Authentication required',
    content: { 'application/json': { schema: ApiErrorSchema } },
} as const;
const invalid = {
    description: 'Invalid request',
    content: { 'application/json': { schema: ApiErrorSchema } },
} as const;
const failed = {
    description: 'Operation failed',
    content: { 'application/json': { schema: ApiErrorSchema } },
} as const;

const pageRoute = createRoute({
    method: 'get',
    path: '/',
    request: { query: WatchlistSelectionSchema },
    responses: {
        200: {
            description: 'Watchlist page',
            content: { 'application/json': { schema: WatchlistPageResponseSchema } },
        },
        401: unauthorized,
        502: failed,
    },
});
const statesRoute = createRoute({
    method: 'get',
    path: '/states',
    responses: {
        200: {
            description: 'Watchlist states',
            content: { 'application/json': { schema: WatchlistStatesResponseSchema } },
        },
        401: unauthorized,
        500: failed,
    },
});
const stateRoute = createRoute({
    method: 'get',
    path: '/{anilistId}',
    request: { params: animeId },
    responses: {
        200: {
            description: 'Watchlist state',
            content: { 'application/json': { schema: WatchlistStateResponseSchema } },
        },
        400: invalid,
        401: unauthorized,
        500: failed,
    },
});
const updateRoute = createRoute({
    method: 'put',
    path: '/{anilistId}',
    request: {
        params: animeId,
        body: { content: { 'application/json': { schema: WatchlistUpdateSchema } } },
    },
    responses: {
        200: {
            description: 'Updated watchlist state',
            content: { 'application/json': { schema: WatchlistStateResponseSchema } },
        },
        400: invalid,
        401: unauthorized,
        500: failed,
    },
});
const deleteRoute = createRoute({
    method: 'delete',
    path: '/{anilistId}',
    request: { params: animeId },
    responses: {
        204: { description: 'Watchlist entry removed' },
        400: invalid,
        401: unauthorized,
        500: failed,
    },
});

function userId(session: AuthSession | null) {
    return session?.user.id ?? null;
}

export const watchlistRoutes = new OpenAPIHono<Environment>({
    defaultHook: (result, context) =>
        result.success
            ? undefined
            : context.json(errorBody('INVALID_REQUEST', 'Request data is invalid'), 400),
})
    .openapi(pageRoute, async (context) => {
        const id = userId(context.get('session'));
        if (!id)
            return context.json(
                errorBody('AUTHENTICATION_REQUIRED', 'Authentication required'),
                401
            );
        try {
            return context.json(
                WatchlistPageResponseSchema.parse(
                    await getWatchlistPage(id, context.req.valid('query'))
                ),
                200
            );
        } catch (cause) {
            console.error('Watchlist page load failed', cause);
            return context.json(
                errorBody('WATCHLIST_LOAD_FAILED', 'Your watchlist could not be loaded'),
                502
            );
        }
    })
    .openapi(statesRoute, async (context) => {
        const id = userId(context.get('session'));
        if (!id)
            return context.json(
                errorBody('AUTHENTICATION_REQUIRED', 'Authentication required'),
                401
            );
        try {
            return context.json(
                WatchlistStatesResponseSchema.parse({ entries: await getWatchlistStates(id) }),
                200
            );
        } catch (cause) {
            console.error('Watchlist states load failed', cause);
            return context.json(
                errorBody('WATCHLIST_LOAD_FAILED', 'Watchlist states could not be loaded'),
                500
            );
        }
    })
    .openapi(stateRoute, async (context) => {
        const id = userId(context.get('session'));
        if (!id)
            return context.json(
                errorBody('AUTHENTICATION_REQUIRED', 'Authentication required'),
                401
            );
        const { anilistId } = context.req.valid('param');
        try {
            return context.json(
                WatchlistStateResponseSchema.parse({
                    animeId: anilistId,
                    state: await getWatchlistState(id, anilistId),
                }),
                200
            );
        } catch (cause) {
            console.error(`Watchlist state load failed for AniList ${anilistId}`, cause);
            return context.json(
                errorBody('WATCHLIST_LOAD_FAILED', 'Watchlist state could not be loaded'),
                500
            );
        }
    })
    .openapi(updateRoute, async (context) => {
        const id = userId(context.get('session'));
        if (!id)
            return context.json(
                errorBody('AUTHENTICATION_REQUIRED', 'Authentication required'),
                401
            );
        const { anilistId } = context.req.valid('param');
        try {
            const state = await setWatchlistState(id, anilistId, context.req.valid('json').state);
            return context.json(
                WatchlistStateResponseSchema.parse({ animeId: anilistId, state }),
                200
            );
        } catch (cause) {
            console.error(`Watchlist update failed for AniList ${anilistId}`, cause);
            return context.json(
                errorBody('WATCHLIST_UPDATE_FAILED', 'Watchlist could not be updated'),
                500
            );
        }
    })
    .openapi(deleteRoute, async (context) => {
        const id = userId(context.get('session'));
        if (!id)
            return context.json(
                errorBody('AUTHENTICATION_REQUIRED', 'Authentication required'),
                401
            );
        const { anilistId } = context.req.valid('param');
        try {
            await removeFromWatchlist(id, anilistId);
            return context.body(null, 204);
        } catch (cause) {
            console.error(`Watchlist removal failed for AniList ${anilistId}`, cause);
            return context.json(
                errorBody(
                    'WATCHLIST_REMOVE_FAILED',
                    'Anime could not be removed from the watchlist'
                ),
                500
            );
        }
    });
