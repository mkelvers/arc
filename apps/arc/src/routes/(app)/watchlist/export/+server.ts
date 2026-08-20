import { error, redirect } from '@sveltejs/kit';

import { getWatchlistEntries } from '$lib/server/watchlist';
import type { RequestHandler } from './$types';

type ExportFormat = 'json' | 'csv' | 'xml';

function csvValue(value: string | number | null) {
    const text = value === null ? '' : String(value);
    return `"${text.replaceAll('"', '""')}"`;
}

export const GET: RequestHandler = async ({ locals, url }) => {
    if (!locals.user) {
        redirect(303, '/login');
    }

    const requestedFormat = url.searchParams.get('format') ?? 'json';
    if (requestedFormat !== 'json' && requestedFormat !== 'csv' && requestedFormat !== 'xml') {
        error(400, 'Choose JSON, CSV, or XML');
    }
    const format: ExportFormat = requestedFormat;

    const stored = await getWatchlistEntries(locals.user.id).catch((cause) => {
        console.error('Watchlist export load failed', cause);
        error(500, 'Watchlist export failed');
    });
    const generatedAt = new Date().toISOString();
    const entries = stored.map(({ anilistId, state, addedAt, updatedAt }) => {
        return {
            anilistId,
            state,
            addedAt: addedAt.toISOString(),
            updatedAt: updatedAt.toISOString(),
        };
    });

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

    return new Response(body, {
        headers: {
            'cache-control': 'no-store',
            'content-disposition': `attachment; filename="arc-watchlist.${format}"`,
            'content-type': contentType,
            'x-content-type-options': 'nosniff',
        },
    });
};
