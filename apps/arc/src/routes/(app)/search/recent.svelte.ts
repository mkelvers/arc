import type { AnimeCard } from '$lib/anime/types';
import { isRecord } from '$lib/utils';

interface RecentResult {
    id: number;
    title: string;
}

export class RecentSearches {
    results = $state<RecentResult[]>([]);

    private save(results: RecentResult[]) {
        this.results = results;
        localStorage.setItem('arc:recent-search-results', JSON.stringify(results));
    }

    load() {
        try {
            const stored = JSON.parse(localStorage.getItem('arc:recent-search-results') ?? '[]');

            if (Array.isArray(stored)) {
                this.results = stored
                    .filter(
                        (value): value is RecentResult =>
                            isRecord(value) &&
                            Number.isSafeInteger(value.id) &&
                            typeof value.title === 'string' &&
                            value.title.length > 0
                    )
                    .map(({ id, title }) => ({ id, title }));
            }
        } catch {
            localStorage.removeItem('arc:recent-search-results');
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
