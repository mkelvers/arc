import type { AnimeCard } from '$lib/anime/types';
import { isRecord } from '$lib/utils';

interface RecentResult {
    id: number;
    title: string;
}

const key = 'arc:recent-search-results';

function isRecent(value: unknown): value is RecentResult {
    if (!isRecord(value)) {
        return false;
    }

    return (
        Number.isSafeInteger(value.id) && typeof value.title === 'string' && value.title.length > 0
    );
}

export class RecentSearches {
    results = $state<RecentResult[]>([]);

    private save(results: RecentResult[]) {
        this.results = results;
        localStorage.setItem(key, JSON.stringify(results));
    }

    load() {
        try {
            const stored = JSON.parse(localStorage.getItem(key) ?? '[]');

            if (Array.isArray(stored)) {
                this.results = stored.filter(isRecent).map(({ id, title }) => ({
                    id,
                    title,
                }));
            }
        } catch {
            localStorage.removeItem(key);
        }
    }

    remember(anime: AnimeCard) {
        this.save([
            { id: anime.id, title: anime.title },
            ...this.results.filter(({ id }) => id !== anime.id),
        ]);
    }

    remove(id: number) {
        this.save(this.results.filter((result) => result.id !== id));
    }

    clear() {
        this.save([]);
    }
}
