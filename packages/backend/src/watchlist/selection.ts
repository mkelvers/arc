import type { WatchlistState } from '@arc/shared/db/schema';
import { audioAvailabilityLabel, type AudioMode } from '@arc/core';
import type { AnimeCard } from '@arc/core';

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
    title?: string | null;
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
    const cardsById = new Map(cards.map((card) => [card.id, card]));

    return filtered
        .flatMap((entry) => {
            const storedCard = cardsById.get(entry.anilistId);
            const pendingMetadata = !storedCard;
            const card: AnimeCard & { pendingMetadata?: true } = storedCard ?? {
                id: entry.anilistId,
                href: `/anime/${entry.anilistId}`,
                link: `/anime/${entry.anilistId}`,
                title: entry.title?.trim() || `Anime ${entry.anilistId}`,
                image: '',
                audioLabel: '',
                format: null,
                status: null,
                score: 0,
                genres: [],
                synopsis: '',
                pendingMetadata: true,
            };
            const audio = audioByAnime.get(card.id) ?? new Set<AudioMode>();
            const matches = pendingMetadata
                ? selection.language === 'all' &&
                  selection.media === 'all' &&
                  selection.type === 'all'
                : matchesFilters(card, audio, selection);

            return matches
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
