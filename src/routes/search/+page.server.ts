import { error } from '@sveltejs/kit';
import { Effect, Either } from 'effect';

import { anime } from '$lib/server/anime';
import { updateWatchlist } from '$lib/server/watchlist/action';
import {
    getWatchlistedAnimeIds,
} from '$lib/server/watchlist/store';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
    const query = url.searchParams.get('q')?.trim() ?? '';
    if (!query) {
        return { query, results: [], watchlistedIds: [] };
    }

    const result = await Effect.runPromise(
        anime.anilist.searchAnime(query).pipe(Effect.either),
    );
    if (Either.isLeft(result)) {
        error(502, result.left.message);
    }

    const watchlisted = await getWatchlistedAnimeIds(
        locals.user?.id,
        result.right.map(({ id }) => id),
    );

    return {
        query,
        results: result.right,
        watchlistedIds: [...watchlisted],
    };
};

export const actions: Actions = {
    watchlist: updateWatchlist,
};
