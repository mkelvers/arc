import type { AnimeCard } from '@arc/core/types';
import { present } from '@arc/core/utils/array';
import { mediaTitle, plainText } from './anilist-text';

interface CardMedia {
    id: number;
    title?: {
        english?: string | null;
        romaji?: string | null;
        native?: string | null;
    } | null;
    coverImage?: {
        extraLarge?: string | null;
        large?: string | null;
    } | null;
    description?: string | null;
    genres?: ReadonlyArray<string | null> | null;
    averageScore?: number | null;
    format?: string | null;
    status?: string | null;
}

export function animeCard(media: CardMedia): AnimeCard | null {
    const image = media.coverImage?.extraLarge ?? media.coverImage?.large ?? null;

    if (!image) {
        return null;
    }

    return {
        id: media.id,
        href: `/anime/${media.id}`,
        link: `/anime/${media.id}`,
        title: mediaTitle(media),
        image,
        audioLabel: '',
        format: media.format ?? null,
        status: media.status ?? null,
        score: media.averageScore ?? 0,
        genres: present(media.genres),
        synopsis: plainText(media.description),
    };
}
