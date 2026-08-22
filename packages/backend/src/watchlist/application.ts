import type { WatchlistState } from '@arc/db/schema';
import { audioAvailabilityLabel, type AudioMode } from '@arc/shared/audio';
import type { AnimeCard } from '@arc/shared/types';

import { getWatchlistAnime } from '../anime/anilist/watchlist';
import { enrichAnimeCards } from '../anime/card-enrichment';
import { storedAudioModes } from '../anime/episodes/model';
import { getWatchlistEntries } from './store';

export {
    getWatchlistState,
    getWatchlistStates,
    removeFromWatchlist,
    setWatchlistState,
} from './store';

export type WatchlistSelection = {
    state: WatchlistState | 'all';
    sort: 'updated' | 'added' | 'alphabetical';
    order: 'newest' | 'oldest';
    language: 'all' | 'sub' | 'dub';
    media: 'all' | 'series' | 'movie';
    type: 'all' | 'airing' | 'finished' | 'not_yet_released' | 'cancelled' | 'hiatus';
};

function matchesFilters(
    card: { format?: string | null; status?: string | null },
    audio: ReadonlySet<'sub' | 'dub' | 'raw'>,
    selection: Pick<WatchlistSelection, 'language' | 'media' | 'type'>
) {
    return (
        (selection.language === 'all' ||
            selection.language === (audio.has('dub') ? 'dub' : 'sub')) &&
        (selection.media === 'all' ||
            selection.media === (card.format === 'MOVIE' ? 'movie' : 'series')) &&
        (selection.type === 'all' ||
            card.status ===
                (selection.type === 'airing' ? 'RELEASING' : selection.type.toUpperCase()))
    );
}

type StoredWatchlistEntry = {
    anilistId: number;
    state: WatchlistState;
    addedAt: Date | null;
    updatedAt: Date | null;
};

export function selectWatchlistEntries(
    cards: AnimeCard[],
    stored: StoredWatchlistEntry[],
    audioByAnime: ReadonlyMap<number, ReadonlySet<AudioMode>>,
    selection: WatchlistSelection
) {
    const filtered =
        selection.state === 'all'
            ? stored
            : stored.filter(({ state }) => state === selection.state);
    const storedById = new Map(filtered.map((entry) => [entry.anilistId, entry]));

    return cards
        .flatMap((card) => {
            const entry = storedById.get(card.id);
            const audio = audioByAnime.get(card.id) ?? new Set<AudioMode>();
            return entry && matchesFilters(card, audio, selection)
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
                    ? Math.max(left.updatedAt ?? 0, left.addedAt ?? 0)
                    : (left.addedAt ?? 0);
            const rightValue =
                selection.sort === 'updated'
                    ? Math.max(right.updatedAt ?? 0, right.addedAt ?? 0)
                    : (right.addedAt ?? 0);
            const time = leftValue - rightValue;
            if (time) {
                return selection.order === 'newest' ? -time : time;
            }
            return left.title.localeCompare(right.title, 'en');
        })
        .map(({ addedAt: _addedAt, updatedAt: _updatedAt, ...entry }) => entry);
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
    const cards = await getWatchlistAnime(selectedIds);
    const audioByAnime = await storedAudioModes(cards.map(({ id }) => id));
    const entries = selectWatchlistEntries(
        await enrichAnimeCards(cards),
        stored,
        audioByAnime,
        selection
    );

    return { entries, totalEntries: stored.length };
}
