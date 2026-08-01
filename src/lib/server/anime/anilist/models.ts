import type { AnimeCard } from '$lib/anime/types';
import { enumLabel, mediaTitle, plainText, present } from './text';
import type { SearchMedia } from './types';

export function animeCard(media: SearchMedia): AnimeCard | null {
    const image =
        media.coverImage?.extraLarge ?? media.coverImage?.large ?? null;

    if (!image) {
        return null;
    }

    return {
        id: media.id,
        href: `/anime/${media.id}`,
        watchHref: `/anime/${media.id}`,
        title: mediaTitle(media),
        image,
        caption: `Anime ${enumLabel(media.format, '')}`.trim(),
        score: media.averageScore ?? 0,
        genres: present(media.genres),
        synopsis: plainText(media.description),
    };
}
