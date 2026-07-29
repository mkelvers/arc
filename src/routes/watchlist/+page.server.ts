import { error, fail, redirect } from '@sveltejs/kit';
import { Effect, Either } from 'effect';

import { anime } from '$lib/server/anime';
import { removeWatchlist } from '$lib/server/watchlist/action';
import {
    getWatchlistEntries,
    replaceWatchlist,
} from '$lib/server/watchlist/store';
import {
    parseWatchlistImport,
    WatchlistImportError,
} from '$lib/server/watchlist/transfer';
import type { Actions, PageServerLoad } from './$types';

const maximumFileSize = 2 * 1_024 * 1_024;
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
    import: async ({ locals, request }) => {
        if (!locals.user) {
            redirect(303, '/login');
        }

        const form = await request.formData();
        if (form.get('confirmReplace') !== 'replace') {
            return fail(400, {
                message: 'Confirm that you want to replace your watchlist.',
            });
        }

        const file = form.get('watchlist');
        if (!(file instanceof File) || !file.size) {
            return fail(400, { message: 'Choose a watchlist JSON file.' });
        }
        if (file.size > maximumFileSize) {
            return fail(413, {
                message: 'The watchlist file must be smaller than 2 MB.',
            });
        }

        try {
            const imported = parseWatchlistImport(await file.text());
            const resolved = await anime.anilist.resolveWatchlistImport(imported);
            const unresolved = imported.filter(
                ({ index }) => !resolved.has(index),
            );

            if (imported.length > 0 && resolved.size === 0) {
                const examples = unresolved
                    .slice(0, 3)
                    .map(
                        ({ malId, anilistId, titles }) =>
                            titles.preferred ??
                            titles.english ??
                            titles.original ??
                            `ID ${anilistId ?? malId}`,
                    )
                    .join(', ');

                return fail(400, {
                    message: `Nothing was changed. No entries could be matched${examples ? `: ${examples}` : ''}.`,
                });
            }

            const replacement = imported.flatMap((entry) => {
                const match = resolved.get(entry.index);

                return match
                    ? [
                          {
                              anilistId: match.id,
                              state: entry.state,
                              position: entry.index,
                              addedAt: entry.addedAt,
                          },
                      ]
                    : [];
            });
            const duplicateIds = replacement.filter(
                ({ anilistId }, index) =>
                    replacement.findIndex(
                        (entry) => entry.anilistId === anilistId,
                    ) !== index,
            );

            if (duplicateIds.length) {
                return fail(400, {
                    message:
                        'Nothing was changed. The imported file contains duplicate anime.',
                });
            }

            await replaceWatchlist(locals.user.id, replacement);

            const skippedMessage = unresolved.length
                ? ` Skipped ${unresolved.length} ${unresolved.length === 1 ? 'entry' : 'entries'} unavailable on AniList.`
                : '';

            return {
                success: true,
                message: `Imported ${replacement.length} ${replacement.length === 1 ? 'anime' : 'anime entries'}.${skippedMessage}`,
            };
        } catch (cause) {
            if (cause instanceof WatchlistImportError) {
                return fail(400, { message: cause.message });
            }

            console.error('Watchlist import failed', cause);
            return fail(500, {
                message: 'Nothing was changed. The watchlist import failed.',
            });
        }
    },
    remove: removeWatchlist,
};
