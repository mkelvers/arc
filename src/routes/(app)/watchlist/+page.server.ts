import { error, redirect } from '@sveltejs/kit';
import { inArray } from 'drizzle-orm';

import { audioAvailabilityLabel } from '$lib/anime/audio';
import { getWatchlistAnime } from '$lib/server/anime/anilist/watchlist';
import { enrichAnimeCards } from '$lib/server/anime/card-enrichment';
import { db } from '$lib/server/db';
import { animeEpisode } from '$lib/server/db/schema';
import { getWatchlistEntries } from '$lib/server/watchlist';
import {
    watchlistActivityTimestamp,
    watchlistLanguage,
    watchlistMatchesFilters,
    watchlistMediaType,
    watchlistOrder,
    watchlistSort,
    watchlistState,
    watchlistType,
} from '$lib/watchlist';
import type { PageServerLoad } from './$types';

function timestamp(value: Date | null) {
    return value?.getTime() ?? null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) {
        redirect(303, '/login');
    }

    const selection = {
        state: watchlistState(url.searchParams.get('state')),
        language: watchlistLanguage(url.searchParams.get('language')),
        media: watchlistMediaType(url.searchParams.get('media')),
        type: watchlistType(url.searchParams.get('type')),
        sort: watchlistSort(url.searchParams.get('sort')),
        order: watchlistOrder(url.searchParams.get('order')),
    };
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
    const entries = (async () => {
        const cards = await getWatchlistAnime(filtered.map(({ anilistId }) => anilistId));
        const cardIds = cards.map(({ id }) => id);
        const episodeRows = cardIds.length
            ? await db
                  .select({ anilistId: animeEpisode.anilistId, audio: animeEpisode.audio })
                  .from(animeEpisode)
                  .where(inArray(animeEpisode.anilistId, cardIds))
            : [];
        const audioByAnime = new Map<number, Set<'sub' | 'dub' | 'raw'>>();

        for (const episode of episodeRows) {
            const audio = audioByAnime.get(episode.anilistId) ?? new Set<'sub' | 'dub' | 'raw'>();
            episode.audio.forEach((mode) => audio.add(mode));
            audioByAnime.set(episode.anilistId, audio);
        }

        const storedById = new Map(filtered.map((entry) => [entry.anilistId, entry]));
        return (await enrichAnimeCards(cards))
            .flatMap((card) => {
                const entry = storedById.get(card.id);
                const audio = audioByAnime.get(card.id) ?? new Set();
                return entry && watchlistMatchesFilters(card, audio, selection)
                    ? [
                          {
                              ...card,
                              audioLabel: audioAvailabilityLabel([
                                  ...(audioByAnime.get(card.id) ?? []),
                              ]),
                              state: entry.state,
                              addedAt: timestamp(entry.addedAt),
                              updatedAt: timestamp(entry.updatedAt),
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
    })().catch((cause) => {
        console.error('Watchlist anime enrichment failed', cause);
        throw error(502, 'Your watchlist anime could not be loaded');
    });

    return {
        pageTitle: 'Watchlist',
        entries,
        totalEntries: stored.length,
        selection,
    };
};
