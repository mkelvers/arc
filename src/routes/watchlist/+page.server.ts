import { error, redirect } from '@sveltejs/kit';
import { Effect, Either } from 'effect';

import { anime } from '$lib/server/anime';
import { removeWatchlist } from '$lib/server/watchlist/action';
import { getWatchlistEntries } from '$lib/server/watchlist/store';
import type { Actions, PageServerLoad } from './$types';

const states = [
    'watching',
    'plan_to_watch',
    'completed',
    'dropped',
] as const;

type WatchlistFilter = 'all' | (typeof states)[number];

function selectedFilter(value: string | null): WatchlistFilter {
    return states.includes(value as (typeof states)[number])
        ? (value as (typeof states)[number])
        : 'all';
}

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) {
        redirect(303, '/login');
    }

    const state = selectedFilter(url.searchParams.get('state'));
    const stored = await getWatchlistEntries(locals.user.id);
    if (!stored.length) {
        return {
            entries: [],
            selectedState: state,
        };
    }

    const result = await Effect.runPromise(
        anime.anilist
            .getWatchlistAnime(stored.map(({ anilistId }) => anilistId))
            .pipe(Effect.either),
    );
    if (Either.isLeft(result)) {
        error(502, result.left.message);
    }

    const storedById = new Map(
        stored.map((entry) => [entry.anilistId, entry]),
    );

    return {
        entries: result.right.flatMap((card) => {
            const entry = storedById.get(card.id);

            return entry
                ? [
                      {
                          ...card,
                          state: entry.state,
                      },
                  ]
                : [];
        }),
        selectedState: state,
    };
};

export const actions: Actions = {
    remove: removeWatchlist,
};
