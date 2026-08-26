import type { AnimeCard } from '@arc/shared/types';
import { z } from 'zod';

interface RecentResult {
    id: number;
    title: string;
}

const recentResultSchema = z.object({ id: z.number().int(), title: z.string().min(1) });
const recentResultsSchema = z.array(recentResultSchema);

export class RecentSearches {
    results = $state<RecentResult[]>([]);

    private save(results: RecentResult[]) {
        this.results = results;
        localStorage.setItem('arc:recent-search-results', JSON.stringify(results));
    }

    load() {
        try {
            const stored = recentResultsSchema.safeParse(
                JSON.parse(localStorage.getItem('arc:recent-search-results') ?? '[]')
            );

            if (stored.success) {
                this.results = stored.data;
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
