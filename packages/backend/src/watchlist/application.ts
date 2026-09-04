import { hydrateMissingAnimeReleases, storedReleaseCards } from '../anime/anilist/releases';
import { animeTitles } from '@arc/core';
import { enrichAnimeCards } from '../anime/card-enrichment';
import { parseStoredAnimeDetails } from '../anime/details';
import { storedAudioModes } from '../anime/episodes/model';
import { logger } from '@arc/backend/internal/logger';
import { selectWatchlistEntries, type WatchlistSelection } from './selection';
import {
    applyWatchlistEntries,
    getWatchlistEntries,
    storeMissingWatchlistTitles,
    type WatchlistImportMode,
} from './store';
import { importedWatchlistEntries, WatchlistImportError } from './transfer';
import {
    enqueueUnresolvedAnimeInterests,
    reconcileAnimeInterests,
} from '../anime/scheduler/interests';

export {
    getWatchlistState,
    getWatchlistStates,
    removeFromWatchlist,
    setWatchlistState,
} from './store';

export { WatchlistImportError };

export async function importWatchlist(
    userId: string,
    source: string,
    filename: string,
    mode: WatchlistImportMode
) {
    const imported = await importedWatchlistEntries(source, filename);
    if (!imported.entries.length) {
        throw new WatchlistImportError('Arc could not match any anime in the file.');
    }
    const result = await applyWatchlistEntries(userId, imported.entries, mode);
    try {
        await hydrateMissingAnimeReleases(imported.entries.map(({ anilistId }) => anilistId));
    } catch (cause) {
        logger.debug('Watchlist metadata hydration failed', cause);
    }
    await reconcileAnimeInterests();
    await enqueueUnresolvedAnimeInterests();

    return { ...result, unmatched: imported.unmatched };
}

export async function exportWatchlist(userId: string) {
    return (await getWatchlistEntries(userId)).map(({ anilistId, state, addedAt, updatedAt }) => ({
        anilistId,
        state,
        addedAt,
        updatedAt,
    }));
}

export async function getWatchlistPage(userId: string, selection: WatchlistSelection) {
    const stored = await getWatchlistEntries(userId);
    if (!stored.length) {
        return { entries: [], totalEntries: 0 };
    }

    const selectedIds =
        selection.state === 'all'
            ? stored.map(({ anilistId }) => anilistId)
            : stored
                  .filter(({ state }) => state === selection.state)
                  .map(({ anilistId }) => anilistId);
    const cards = await storedReleaseCards(selectedIds);
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const titledStored = stored.map((entry) => {
        const details = parseStoredAnimeDetails(entry.details);
        const title =
            cardsById.get(entry.anilistId)?.title.trim() ||
            entry.title?.trim() ||
            entry.catalogTitle?.trim() ||
            (details ? animeTitles(details)[0] : undefined) ||
            null;
        return { ...entry, title };
    });
    const titleBackfills = titledStored.flatMap((entry, index) =>
        entry.title && entry.internalAnimeId != null && !stored[index]?.title
            ? [{ internalAnimeId: entry.internalAnimeId, title: entry.title }]
            : []
    );
    const [audioByAnime, enrichedCards] = await Promise.all([
        storedAudioModes(cards.map(({ id }) => id)),
        enrichAnimeCards(cards).catch((cause) => {
            logger.debug('Watchlist card enrichment failed', cause);
            return cards;
        }),
        storeMissingWatchlistTitles(titleBackfills).catch((cause) => {
            logger.debug('Watchlist title backfill failed', cause);
        }),
    ]);
    const entries = selectWatchlistEntries(enrichedCards, titledStored, audioByAnime, selection);

    return { entries, totalEntries: stored.length };
}
