import { Hono } from 'hono';
import { z } from 'zod';

import { PageQuerySchema, SearchQuerySchema } from '@arc/api-contract/anime';
import { parseBrowseFilters } from '@arc/shared/browse';
import { newAnimePage, popularAnimePage } from '@arc/backend/internal/anime/browse';
import { homePage } from '@arc/backend/internal/anime/application';
import { getSearchResults } from '@arc/backend/internal/anime/search';
import { dismissPlaybackProgress } from '@arc/backend/progress';
import { middleware, validate, type ApiEnvironment } from '../http';

export const catalog = new Hono<ApiEnvironment>();

catalog.use('*', middleware);

catalog.get('/home', async (context) =>
    context.json(await homePage(context.get('session').user.id))
);

catalog.delete(
    '/home/continue-watching/:anilistId',
    validate('param', z.object({ anilistId: z.coerce.number().int().positive() })),
    async (context) => {
        await dismissPlaybackProgress(
            context.get('session').user.id,
            context.req.valid('param').anilistId
        );
        return context.body(null, 204);
    }
);

catalog.get('/new', validate('query', PageQuerySchema), async (context) => {
    const filters = parseBrowseFilters(new URLSearchParams(context.req.query()));
    if (!filters) {
        return context.json(
            { error: { code: 'INVALID_REQUEST', message: 'Invalid catalog filters' } },
            400
        );
    }
    return context.json(await newAnimePage(context.req.valid('query').page, filters));
});

catalog.get('/popular', validate('query', PageQuerySchema), async (context) => {
    const filters = parseBrowseFilters(new URLSearchParams(context.req.query()));
    if (!filters) {
        return context.json(
            { error: { code: 'INVALID_REQUEST', message: 'Invalid catalog filters' } },
            400
        );
    }
    return context.json(await popularAnimePage(context.req.valid('query').page, filters));
});

catalog.get('/search', validate('query', SearchQuerySchema), async (context) => {
    const query = context.req.valid('query').q;
    if (query.length < 2) {
        return context.json([]);
    }

    return context.json(await getSearchResults(query));
});
