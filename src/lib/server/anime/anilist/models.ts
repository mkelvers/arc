import type { AnimeCard } from '$lib/anime/types';
import { enumLabel, mediaTitle, plainText, present } from './text';
import type {
    HomeMedia,
    HomepageHighlight,
    SearchMedia,
} from './types';

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

export function homepageHighlight(
    media: HomeMedia,
): HomepageHighlight | null {
    const fallback =
        media.coverImage?.extraLarge ?? media.coverImage?.large ?? null;
    const image = media.bannerImage ?? fallback;

    if (!image || !fallback) {
        return null;
    }

    return {
        id: media.id,
        title: mediaTitle(media),
        image,
        description: plainText(media.description),
        genres: present(media.genres),
        format: enumLabel(media.format, ''),
        score: media.averageScore ?? 0,
    };
}
