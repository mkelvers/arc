import { error, redirect } from '@sveltejs/kit';

import { audioAvailabilityLabel } from '$lib/anime/audio';
import { getWatchlistAnime } from '$lib/server/anime/anilist/watchlist';
import { enrichAnimeCards } from '$lib/server/anime/card-enrichment';
import { storedAudioModes } from '$lib/server/anime/episodes/model';
import { getWatchlistEntries } from '$lib/server/watchlist';
import {
    watchlistActivityTimestamp,
    watchlistMatchesFilters,
    WatchlistSelectionSchema,
} from '$lib/watchlist';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) {
        redirect(303, '/login');
    }

    const selection = WatchlistSelectionSchema.parse(Object.fromEntries(url.searchParams));
    const stored = await getWatchlistEntries(locals.user.id).catch((cause) => {
        console.error('Watchlist entries load failed', cause);
        error(500, 'Your watchlist could not be loaded');
    });

    if (!stored.length) {
        return { pageTitle: 'Watchlist', entries: [], totalEntries: 0, selection };
    }

    const filtered =
        selection.state === 'all'
            ? stored
            : stored.filter(({ state }) => state === selection.state);

    try {
        const cards = await getWatchlistAnime(filtered.map(({ anilistId }) => anilistId));
        const audioByAnime = await storedAudioModes(cards.map(({ id }) => id));

        const storedById = new Map(filtered.map((entry) => [entry.anilistId, entry]));
        const entries = (await enrichAnimeCards(cards))
            .flatMap((card) => {
                const entry = storedById.get(card.id);
                const audio = audioByAnime.get(card.id) ?? new Set();
                return entry && watchlistMatchesFilters(card, audio, selection)
                    ? [
                          {
                              ...card,
                              audioLabel: audioAvailabilityLabel([...audio]),
                              state: entry.state,
                              addedAt: entry.addedAt?.getTime() ?? null,
                              updatedAt: entry.updatedAt?.getTime() ?? null,
                          },
                      ]
                    : [];
            })
            .sort((left, right) => {
                if (selection.sort === 'alphabetical') {
                    const title = left.title.localeCompare(right.title, 'en');
                    return selection.order === 'newest' ? title : -title;
                }

                const leftValue =
                    selection.sort === 'updated'
                        ? watchlistActivityTimestamp(left.updatedAt, left.addedAt)
                        : (left.addedAt ?? 0);
                const rightValue =
                    selection.sort === 'updated'
                        ? watchlistActivityTimestamp(right.updatedAt, right.addedAt)
                        : (right.addedAt ?? 0);

                const time = leftValue - rightValue;
                if (time) {
                    return selection.order === 'newest' ? -time : time;
                }

                return left.title.localeCompare(right.title, 'en');
            })
            .map(({ addedAt: _addedAt, updatedAt: _updatedAt, ...entry }) => entry);

        return {
            pageTitle: 'Watchlist',
            entries,
            totalEntries: stored.length,
            selection,
        };
    } catch (cause) {
        console.error('Watchlist anime enrichment failed', cause);
        throw error(502, 'Your watchlist anime could not be loaded');
    }
};
