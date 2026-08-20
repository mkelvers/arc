import { error, fail, redirect } from '@sveltejs/kit';

import { audioAvailabilityLabel } from '$lib/audio';
import { getWatchlistAnime } from '$lib/server/anime/anilist/watchlist';
import { resolveWatchlistImport } from '$lib/server/anime/anilist/watchlist-transfer';
import { enrichAnimeCards } from '$lib/server/anime/card-enrichment';
import { storedAudioModes } from '$lib/server/anime/episodes/model';
import {
    applyWatchlistEntries,
    getWatchlistEntries,
    type WatchlistImportMode,
} from '$lib/server/watchlist';
import {
    importedActivityAt,
    parseWatchlistImport,
    WatchlistImportError,
} from '$lib/server/watchlist-transfer';
import {
    watchlistActivityTimestamp,
    watchlistMatchesFilters,
    WatchlistSelectionSchema,
} from '$lib/watchlist';
import type { Actions, PageServerLoad } from './$types';

const maximumWatchlistFileSize = 2 * 1_024 * 1_024;

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
        return { entries: [], totalEntries: 0, selection };
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
            entries,
            totalEntries: stored.length,
            selection,
        };
    } catch (cause) {
        console.error('Watchlist anime enrichment failed', cause);
        throw error(502, 'Your watchlist anime could not be loaded');
    }
};

export const actions: Actions = {
    import: async ({ locals, request }) => {
        if (!locals.user) {
            redirect(303, '/login');
        }

        const form = await request.formData();
        const mode: WatchlistImportMode = form.get('replace') === 'true' ? 'replace' : 'add';
        const file = form.get('watchlist');
        if (!(file instanceof File) || !file.size) {
            return fail(400, { message: 'Choose a JSON, CSV, or XML watchlist file.' });
        }
        if (file.size > maximumWatchlistFileSize) {
            return fail(413, { message: 'The watchlist file must be smaller than 2 MB.' });
        }

        try {
            const imported = parseWatchlistImport(await file.text(), file.name);
            const resolved = await resolveWatchlistImport(imported);
            if (!resolved.size) {
                return fail(400, {
                    message: 'Nothing was changed. Arc could not match any anime in the file.',
                });
            }

            const importedAt = Date.now();
            const entries = imported.flatMap((entry) => {
                const match = resolved.get(entry.index);
                const activityAt = importedActivityAt(entry.index, importedAt, entry.activityAt);
                return match
                    ? [
                          {
                              anilistId: match.id,
                              state: entry.state,
                              addedAt: entry.addedAt ?? activityAt,
                              updatedAt: activityAt,
                          },
                      ]
                    : [];
            });
            const seen = new Set<number>();
            if (
                entries.some(({ anilistId }) => {
                    if (seen.has(anilistId)) {
                        return true;
                    }
                    seen.add(anilistId);
                    return false;
                })
            ) {
                return fail(400, {
                    message:
                        'Nothing was changed. The file contains the same anime more than once.',
                });
            }

            const result = await applyWatchlistEntries(locals.user.id, entries, mode);
            const unmatched = imported.length - entries.length;
            const skipped = [
                result.skipped ? `${result.skipped} already in your watchlist` : null,
                unmatched ? `${unmatched} could not be matched` : null,
            ].filter(Boolean);
            const suffix = skipped.length ? ` Skipped ${skipped.join(' and ')}.` : '';
            const message =
                mode === 'replace'
                    ? `Replaced your watchlist with ${result.added} anime.${suffix}`
                    : `Imported ${result.added} new anime.${suffix}`;

            return { message };
        } catch (cause) {
            if (cause instanceof WatchlistImportError) {
                return fail(400, { message: cause.message });
            }

            console.error('Watchlist import failed', cause);
            return fail(500, { message: 'Nothing was changed. The watchlist import failed.' });
        }
    },
};
