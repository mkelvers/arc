import { fail, redirect } from '@sveltejs/kit';

import { resolveWatchlistImport } from '$lib/server/anime/anilist/watchlist-transfer';
import { applyWatchlistEntries, type WatchlistImportMode } from '$lib/server/watchlist';
import { GraphQLRequestError } from '$lib/server/graphql';
import {
    importedActivityAt,
    parseMyAnimeListXml,
    parseUniversalCsv,
    parseWatchlistImport,
    WatchlistImportError,
} from '$lib/server/watchlist-transfer';
import type { Actions, PageServerLoad } from './$types';

const maximumFileSize = 2 * 1_024 * 1_024;

export const load: PageServerLoad = () => ({
    pageTitle: 'Import & Export',
});

async function importFile(
    userId: string,
    file: File,
    parser: (source: string) => ReturnType<typeof parseWatchlistImport>,
    mode: WatchlistImportMode
) {
    if (!(file instanceof File) || !file.size) {
        return fail(400, { message: 'Choose a library file.' });
    }

    if (file.size > maximumFileSize) {
        return fail(413, { message: 'The library file must be smaller than 2 MB.' });
    }

    try {
        const imported = parser(await file.text());
        const resolved = await resolveWatchlistImport(imported);
        const importedAt = Date.now();
        const entries = imported.flatMap((entry) => {
            const match = resolved.get(entry.index);
            if (!match) {
                return [];
            }

            return [
                {
                    anilistId: match.id,
                    state: entry.state,
                    addedAt: entry.addedAt ?? importedActivityAt(entry.index, importedAt),
                    updatedAt: entry.updatedAt ?? importedActivityAt(entry.index, importedAt),
                },
            ];
        });

        if (!entries.length) {
            return fail(400, { message: 'No anime could be matched.' });
        }

        const result = await applyWatchlistEntries(userId, entries, mode);
        return {
            success: true,
            message:
                mode === 'replace'
                    ? `Replaced your watchlist with ${result.added} anime.`
                    : `Added ${result.added} anime. Existing entries were left unchanged.`,
        };
    } catch (cause) {
        if (cause instanceof WatchlistImportError) {
            return fail(400, { message: cause.message });
        }

        if (
            cause instanceof GraphQLRequestError &&
            (cause.status === 429 || cause.status == null || cause.status >= 500)
        ) {
            return fail(503, {
                message: 'AniList is temporarily unavailable. Please try again shortly.',
            });
        }

        console.error('Library import failed', cause);
        return fail(502, { message: 'The library could not be imported.' });
    }
}

export const actions: Actions = {
    importMal: async ({ locals, request }) => {
        if (!locals.user) {
            redirect(303, '/login');
        }

        const form = await request.formData();
        const file = form.get('file');
        const mode = form.get('mode') === 'replace' ? 'replace' : 'add';
        return importFile(locals.user.id, file as File, parseMyAnimeListXml, mode);
    },
    importUniversal: async ({ locals, request }) => {
        if (!locals.user) {
            redirect(303, '/login');
        }

        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) {
            return fail(400, { message: 'Choose a library file.' });
        }

        const extension = file.name.toLowerCase().split('.').pop();
        const mode = form.get('mode') === 'replace' ? 'replace' : 'add';
        const parser =
            extension === 'json'
                ? parseWatchlistImport
                : extension === 'csv'
                  ? parseUniversalCsv
                  : parseMyAnimeListXml;
        return importFile(locals.user.id, file, parser, mode);
    },
};
