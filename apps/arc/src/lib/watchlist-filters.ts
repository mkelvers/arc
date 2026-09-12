import { writable } from 'svelte/store';

import type { WatchlistCard, WatchlistSelection } from '@arc/core/client';

const defaultSelection: WatchlistSelection = {
    state: 'all',
    sort: 'updated',
    order: 'newest',
    language: 'all',
    media: 'all',
    type: 'all',
};

function matches(entry: WatchlistCard, selection: WatchlistSelection) {
    if (selection.state !== 'all' && entry.state !== selection.state) {
        return false;
    }

    if (
        entry.pendingMetadata &&
        (selection.language !== 'all' || selection.media !== 'all' || selection.type !== 'all')
    ) {
        return false;
    }

    return (
        (selection.language === 'all' ||
            (selection.language === 'dub'
                ? entry.audio.includes('dub')
                : !entry.audio.includes('dub'))) &&
        (selection.media === 'all' ||
            selection.media === (entry.format === 'MOVIE' ? 'movie' : 'series')) &&
        (selection.type === 'all' ||
            selection.type ===
                (entry.status === 'RELEASING' ? 'airing' : entry.status?.toLowerCase()))
    );
}

function sortEntries(left: WatchlistCard, right: WatchlistCard, selection: WatchlistSelection) {
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
}

export const watchlistFilters = writable<WatchlistSelection>({ ...defaultSelection });

export function setWatchlistFilter<Key extends keyof WatchlistSelection>(
    key: Key,
    value: WatchlistSelection[Key]
) {
    watchlistFilters.update((selection) => ({ ...selection, [key]: value }));
}

export function resetWatchlistFilters() {
    watchlistFilters.set({ ...defaultSelection });
}

export function filterWatchlist(entries: readonly WatchlistCard[], selection: WatchlistSelection) {
    return entries
        .filter((entry) => matches(entry, selection))
        .toSorted((left, right) => sortEntries(left, right, selection));
}
