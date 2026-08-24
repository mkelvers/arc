import { Hono } from 'hono';
import { z } from 'zod';

import { WatchlistSelectionSchema, WatchlistUpdateSchema } from '@arc/api-contract/watchlist';
import {
    exportMyAnimeListWatchlist,
    exportWatchlist,
    getWatchlistPage,
    getWatchlistState,
    getWatchlistStates,
    importWatchlist,
    removeFromWatchlist,
    setWatchlistState,
    WatchlistImportError,
} from '@arc/backend/watchlist';
import { middleware, validate, type ApiEnvironment } from '../http';

const AnimeIdSchema = z.object({
    anilistId: z.coerce.number().int().positive(),
});

const maximumWatchlistFileSize = 2 * 1_024 * 1_024;
const ExportFormatSchema = z.object({
    format: z.enum(['json', 'csv', 'xml', 'mal']).default('json'),
});

function errorResponse(message: string) {
    return {
        error: {
            code: 'INVALID_REQUEST' as const,
            message,
        },
    };
}

function csvValue(value: string | number) {
    return `"${String(value).replaceAll('"', '""')}"`;
}

function xmlValue(value: string) {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export const watchlist = new Hono<ApiEnvironment>();

watchlist.use('*', middleware);

watchlist.get('/', validate('query', WatchlistSelectionSchema), async (context) =>
    context.json(await getWatchlistPage(context.get('session').user.id, context.req.valid('query')))
);

watchlist.get('/states', async (context) =>
    context.json({ entries: await getWatchlistStates(context.get('session').user.id) })
);

watchlist.post('/import', async (context) => {
    const contentLength = Number(context.req.header('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maximumWatchlistFileSize + 16_384) {
        return context.json(errorResponse('The watchlist file must be smaller than 2 MB.'), 413);
    }

    let form: FormData;
    try {
        form = await context.req.raw.formData();
    } catch {
        return context.json(errorResponse('Choose a JSON, CSV, or XML watchlist file.'), 400);
    }
    const file = form.get('watchlist');
    if (!(file instanceof File) || !file.size) {
        return context.json(errorResponse('Choose a JSON, CSV, or XML watchlist file.'), 400);
    }
    if (file.size > maximumWatchlistFileSize) {
        return context.json(errorResponse('The watchlist file must be smaller than 2 MB.'), 413);
    }

    try {
        const mode = form.get('replace') === 'true' ? 'replace' : 'add';
        const result = await importWatchlist(
            context.get('session').user.id,
            await file.text(),
            file.name,
            mode
        );
        const skipped = [
            result.skipped ? `${result.skipped} already in your watchlist` : null,
            result.unmatched ? `${result.unmatched} could not be matched` : null,
        ].filter((message): message is string => message !== null);
        const suffix = skipped.length ? ` Skipped ${skipped.join(' and ')}.` : '';
        const message =
            mode === 'replace'
                ? `Replaced your watchlist with ${result.added} anime.${suffix}`
                : `Imported ${result.added} new anime.${suffix}`;
        return context.json({ message });
    } catch (cause) {
        if (cause instanceof WatchlistImportError) {
            return context.json(errorResponse(`Nothing was changed. ${cause.message}`), 400);
        }
        throw cause;
    }
});

watchlist.get('/export', validate('query', ExportFormatSchema), async (context) => {
    const format = context.req.valid('query').format;
    const generatedAt = new Date().toISOString();
    if (format === 'mal') {
        const entries = await exportMyAnimeListWatchlist(context.get('session').user.id);
        const statuses = {
            watching: 'Watching',
            plan_to_watch: 'Plan to Watch',
            completed: 'Completed',
            dropped: 'Dropped',
        } as const;
        const body = [
            '<?xml version="1.0" encoding="UTF-8" ?>',
            '<myanimelist>',
            ...entries.map(
                (entry) =>
                    `  <anime><series_animedb_id>${entry.malId ?? ''}</series_animedb_id><series_title>${xmlValue(entry.title)}</series_title><my_status>${statuses[entry.state]}</my_status></anime>`
            ),
            '</myanimelist>',
        ].join('\n');
        return context.body(`${body}\n`, 200, {
            'Cache-Control': 'no-store',
            'Content-Disposition': 'attachment; filename="arc-myanimelist.xml"',
            'Content-Type': 'application/xml; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
        });
    }

    const entries = (await exportWatchlist(context.get('session').user.id)).map(
        ({ anilistId, state, addedAt, updatedAt }) => ({
            anilistId,
            state,
            addedAt: addedAt.toISOString(),
            updatedAt: updatedAt.toISOString(),
        })
    );

    let body: string;
    let contentType: string;
    if (format === 'csv') {
        body = [
            ['anilist_id', 'status', 'added_at', 'updated_at'],
            ...entries.map((entry) => [
                entry.anilistId,
                entry.state,
                entry.addedAt,
                entry.updatedAt,
            ]),
        ]
            .map((row) => row.map(csvValue).join(','))
            .join('\r\n');
        body += '\r\n';
        contentType = 'text/csv; charset=utf-8';
    } else if (format === 'xml') {
        body = `<?xml version="1.0" encoding="UTF-8"?>\n<watchlist schema_version="1.0" generated_at="${generatedAt}">\n${entries
            .map(
                (entry) =>
                    `  <anime>\n    <anilist_id>${entry.anilistId}</anilist_id>\n    <status>${entry.state}</status>\n    <added_at>${entry.addedAt}</added_at>\n    <updated_at>${entry.updatedAt}</updated_at>\n  </anime>`
            )
            .join('\n')}\n</watchlist>\n`;
        contentType = 'application/xml; charset=utf-8';
    } else {
        body = `${JSON.stringify(
            {
                schema_version: '1.0',
                generated_at: generatedAt,
                entries: entries.map((entry) => ({
                    anilist_id: entry.anilistId,
                    status: entry.state,
                    added_at: entry.addedAt,
                    updated_at: entry.updatedAt,
                })),
            },
            null,
            2
        )}\n`;
        contentType = 'application/json; charset=utf-8';
    }

    return context.body(body, 200, {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="arc-watchlist.${format}"`,
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
    });
});

watchlist.get('/:anilistId', validate('param', AnimeIdSchema), async (context) => {
    const { anilistId } = context.req.valid('param');
    return context.json({
        animeId: anilistId,
        state: await getWatchlistState(context.get('session').user.id, anilistId),
    });
});

watchlist.put(
    '/:anilistId',
    validate('param', AnimeIdSchema),
    validate('json', WatchlistUpdateSchema),
    async (context) => {
        const { anilistId } = context.req.valid('param');
        const input = context.req.valid('json');
        return context.json({
            animeId: anilistId,
            state: await setWatchlistState(
                context.get('session').user.id,
                anilistId,
                input.state,
                input.title
            ),
        });
    }
);

watchlist.delete('/:anilistId', validate('param', AnimeIdSchema), async (context) => {
    await removeFromWatchlist(context.get('session').user.id, context.req.valid('param').anilistId);
    return context.body(null, 204);
});
