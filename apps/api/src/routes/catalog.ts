import { Hono } from 'hono';
import { z } from 'zod';

import {
    AnimeIdSchema,
    PageQuerySchema,
    ReleaseCalendarSchema,
    SearchQuerySchema,
} from '@arc/api-contract/anime';
import { parseBrowseFilters } from '@arc/shared/browse';
import { catalogTaxonomy } from '@arc/core/catalog/storage';
import { newAnimePage, popularAnimePage } from '@arc/backend/internal/anime/browse';
import { homePage } from '@arc/backend/internal/anime/application';
import { releaseCalendar } from '@arc/backend/internal/anime/release-calendar';
import { simulcast } from '@arc/backend/internal/anime/simulcast';
import { getSearchResults } from '@arc/backend/internal/anime/search';
import { clearPlaybackProgress } from '@arc/backend/progress';
import { middleware, validate, type ApiEnvironment } from '../http';

const SimulcastQuerySchema = PageQuerySchema.extend({
    season: z.string().optional(),
    year: z.string().optional(),
});

export const catalog = new Hono<ApiEnvironment>();

catalog.use('*', middleware);

catalog.get('/home', async (context) =>
    context.json(await homePage(context.get('session').user.id))
);

catalog.get('/schedule', async (context) =>
    context.json(ReleaseCalendarSchema.parse(await releaseCalendar()))
);

catalog.get('/taxonomy', async (context) => context.json(await catalogTaxonomy()));

catalog.delete(
    '/home/continue-watching/:anilistId',
    validate('param', z.object({ anilistId: AnimeIdSchema })),
    async (context) => {
        await clearPlaybackProgress(
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
            {
                error: {
                    code: 'INVALID_REQUEST',
                    message: 'Invalid catalog filters',
                },
            },
            400
        );
    }
    return context.json(await newAnimePage(context.req.valid('query').page, filters));
});

catalog.get('/popular', validate('query', PageQuerySchema), async (context) => {
    const filters = parseBrowseFilters(new URLSearchParams(context.req.query()));
    if (!filters) {
        return context.json(
            {
                error: {
                    code: 'INVALID_REQUEST',
                    message: 'Invalid catalog filters',
                },
            },
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

catalog.get('/simulcast', validate('query', SimulcastQuerySchema), async (context) => {
    const page = await simulcast(
        new URLSearchParams(context.req.query()),
        context.req.valid('query').page
    );
    return page
        ? context.json(context.req.valid('query').page === 1 ? page : page.page)
        : context.json(
              {
                  error: {
                      code: 'NOT_FOUND',
                      message: 'That simulcast season is not available',
                  },
              },
              404
          );
});
