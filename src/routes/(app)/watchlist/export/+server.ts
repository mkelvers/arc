import { error, redirect } from '@sveltejs/kit';

import { getWatchlistTransferAnime } from '$lib/server/anime/anilist/watchlist-transfer';
import { getWatchlistEntries } from '$lib/server/watchlist';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    redirect(303, '/login');
  }

  const stored = await getWatchlistEntries(locals.user.id);
  let mediaById = new Map<number, Awaited<ReturnType<typeof getWatchlistTransferAnime>>[number]>();

  try {
    const media = await getWatchlistTransferAnime(stored.map(({ anilistId }) => anilistId));
    mediaById = new Map(media.map((entry) => [entry.id, entry]));
  } catch (cause) {
    // Provider metadata is optional. AniList IDs and Arc state are sufficient
    // for a lossless Arc round trip, so keep the export available.
    console.warn('Watchlist export enrichment failed', cause);
  }

  try {
    const body = {
      schema_version: '1.0',
      generated_at: new Date().toISOString(),
      entries: stored.map(({ anilistId, state, addedAt, updatedAt }) => {
        const media = mediaById.get(anilistId);
        return {
          anilist_id: anilistId,
          mal_id: media?.idMal ?? null,
          status: state,
          added_at: addedAt.toISOString(),
          updated_at: updatedAt.toISOString(),
          titles: {
            preferred:
              media?.title?.english ?? media?.title?.romaji ?? media?.title?.native ?? null,
            english: media?.title?.english ?? null,
            romaji: media?.title?.romaji ?? null,
            native: media?.title?.native ?? null,
          },
        };
      }),
    };

    return new Response(`${JSON.stringify(body, null, 2)}\n`, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="arc-watchlist.json"',
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  } catch (cause) {
    console.error('Watchlist export failed', cause);
    error(500, 'Watchlist export failed');
  }
};
