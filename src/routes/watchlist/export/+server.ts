import { error, redirect } from '@sveltejs/kit';

import { anime } from '$lib/server/anime';
import { getWatchlistEntries } from '$lib/server/watchlist/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        redirect(303, '/login');
    }

    const stored = await getWatchlistEntries(locals.user.id);

    try {
        const media = await anime.anilist.getWatchlistTransferAnime(
            stored.map(({ anilistId }) => anilistId),
        );
        const mediaById = new Map(media.map((entry) => [entry.id, entry]));
        const missing = stored.filter(
            ({ anilistId }) => !mediaById.has(anilistId),
        );

        if (missing.length) {
            error(502, 'Some watchlist entries could not be exported');
        }

        const body = {
            schema_version: '1.0',
            generated_at: new Date().toISOString(),
            entries: stored.map(({ anilistId, state, addedAt }) => {
                const entry = mediaById.get(anilistId)!;

                return {
                    anilist_id: anilistId,
                    mal_id: entry.idMal,
                    status: state,
                    added_at: addedAt.toISOString(),
                    titles: {
                        preferred:
                            entry.title?.english ??
                            entry.title?.romaji ??
                            entry.title?.native ??
                            null,
                        english: entry.title?.english ?? null,
                        original: entry.title?.romaji ?? null,
                        japanese: entry.title?.native ?? null,
                    },
                };
            }),
        };

        return new Response(`${JSON.stringify(body, null, 2)}\n`, {
            headers: {
                'Cache-Control': 'no-store',
                'Content-Disposition':
                    'attachment; filename="watchlist.json"',
                'Content-Type': 'application/json; charset=utf-8',
            },
        });
    } catch (cause) {
        console.error('Watchlist export failed', cause);
        error(502, 'Watchlist export failed');
    }
};
