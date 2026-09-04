import type { AnimeCard } from '@arc/core';
import { withAnimeCardSynopses } from './synopsis';
import { getStoredPosters } from '@arc/core/tmdb';

export async function enrichAnimeCards<T extends AnimeCard>(cards: T[]): Promise<T[]> {
    const anilistIds = [...new Set(cards.map(({ id }) => id))];
    if (!anilistIds.length) {
        return cards;
    }

    // Detail enrichment populates posters. List artwork remains read-only so a
    // large rail cannot fan out into one TMDB artwork request per card.
    const [posters, withSynopses] = await Promise.all([
        getStoredPosters(anilistIds),
        withAnimeCardSynopses(cards),
    ]);

    return withSynopses.map((card) => ({
        ...card,
        image: posters.get(card.id) ?? card.image,
    }));
}
