import type { AnimeCard } from '$lib/anime/types';
import { getStoredPosters } from './tmdb/poster';

export async function withAnimeCardPosters<T extends AnimeCard>(cards: T[]): Promise<T[]> {
    const anilistIds = [...new Set(cards.map(({ id }) => id))];
    if (!anilistIds.length) {
        return cards;
    }

    // Title detail enrichment populates posters. List rendering stays read-only
    // so a large rail cannot fan out into one AniList/TMDB request per card.
    const posters = await getStoredPosters(anilistIds);

    return cards.map((card) => ({
        ...card,
        image: posters.get(card.id) ?? card.image,
    }));
}
