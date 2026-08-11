import { redirect } from '@sveltejs/kit';

import { getWatchlistEntries } from '$lib/server/watchlist';
import { getWatchlistTransferAnime } from '$lib/server/anime/anilist/watchlist-transfer';
import type { RequestHandler } from './$types';

function escapeXml(value: string) {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        redirect(303, '/login');
    }

    const entries = await getWatchlistEntries(locals.user.id);
    const media = await getWatchlistTransferAnime(entries.map(({ anilistId }) => anilistId));
    const mediaById = new Map(media.map((entry) => [entry.id, entry]));
    const body = [
        '<?xml version="1.0" encoding="UTF-8" ?>',
        '<myanimelist>',
        ...entries.map(({ anilistId, state }) => {
            const item = mediaById.get(anilistId);
            const status = {
                watching: 'Watching',
                plan_to_watch: 'Plan to Watch',
                completed: 'Completed',
                dropped: 'Dropped',
            }[state];
            const title = item?.title?.english ?? item?.title?.romaji ?? item?.title?.native ?? '';
            return `  <anime><series_animedb_id>${item?.idMal ?? ''}</series_animedb_id><series_title>${escapeXml(
                title
            )}</series_title><my_status>${status}</my_status></anime>`;
        }),
        '</myanimelist>',
    ].join('\n');

    return new Response(`${body}\n`, {
        headers: {
            'Cache-Control': 'no-store',
            'Content-Disposition': 'attachment; filename="arc-myanimelist.xml"',
            'Content-Type': 'application/xml; charset=utf-8',
        },
    });
};
