import type { AnimeEpisode } from '$lib/anime';
import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';
import { allanime } from './allanime';
import { tmdb } from './tmdb';

type AniListAnime = NonNullable<AnimeQuery['Media']>;

function audioLabel(hasSub: boolean, hasDub: boolean) {
    if (hasSub && hasDub) return 'Dub | Sub';
    if (hasDub) return 'Dub';
    return 'Subtitled';
}

function duration(minutes: number | null | undefined) {
    if (!minutes || minutes <= 0) return '';

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (!hours) return `${remainder}m`;
    if (!remainder) return `${hours}h`;
    return `${hours}h, ${remainder}m`;
}

async function getEpisodes(anime: AniListAnime): Promise<AnimeEpisode[]> {
    const source = await allanime.getEpisodes(anime);
    const metadata = await tmdb
        .getEpisodeMetadata(anime, source)
        .catch(() => new Map());

    return source.map((episode) => {
        const media = metadata.get(episode.id);
        const title = media?.title || episode.title || `Episode ${episode.id}`;
        const slug =
            title
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || `episode-${episode.id}`;

        return {
            id: episode.id,
            number: episode.number,
            label: episode.label,
            title,
            slug,
            href: `/anime/${anime.id}/watch/${encodeURIComponent(slug)}`,
            hasSub: episode.hasSub,
            hasDub: episode.hasDub,
            audioLabel: audioLabel(episode.hasSub, episode.hasDub),
            imageUrl: media?.imageUrl ?? null,
            duration: duration(media?.runtime ?? anime.duration),
            airDate: media?.airDate ?? '',
            overview: media?.overview ?? '',
        };
    });
}

export const episodes = { getEpisodes };
