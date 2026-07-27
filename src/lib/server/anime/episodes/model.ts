import { asc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import type { AnimeEpisode } from '$lib/anime/types';
import { db } from '$lib/server/db';
import { animeEpisode } from '$lib/server/db/schema';
import type { ProviderEpisode } from '../providers/types';
import type { AniListAnime, StoredEpisode } from './types';

function duration(minutes: number | null | undefined) {
    if (!minutes || minutes <= 0) {
        return '';
    }

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (!hours) {
        return `${remainder}m`;
    }

    if (!remainder) {
        return `${hours}h`;
    }

    return `${hours}h, ${remainder}m`;
}

function episodeModel(
    episode: StoredEpisode,
    fallbackDuration: number | null | undefined,
): AnimeEpisode {
    const title =
        episode.metadataTitle ||
        episode.providerTitle ||
        `Episode ${episode.episodeId}`;

    return {
        id: episode.episodeId,
        number: episode.number,
        label: `E${Number.isInteger(episode.number) ? episode.number : episode.episodeId}`,
        title,
        href: `/anime/${episode.anilistId}/watch/${encodeURIComponent(episode.episodeId)}`,
        audio: episode.audio,
        image: episode.imageUrl,
        duration: duration(episode.runtimeMinutes ?? fallbackDuration),
        releaseDate: episode.airDate ?? '',
        overview: episode.overview ?? '',
    };
}

export async function storedEpisodes(anime: AniListAnime) {
    const rows = await db
        .select()
        .from(animeEpisode)
        .where(eq(animeEpisode.anilistId, anime.id))
        .orderBy(asc(animeEpisode.number));

    return rows.map((episode) => episodeModel(episode, anime.duration));
}

export function sourceRevision(episodes: ProviderEpisode[]) {
    return createHash('sha256')
        .update(
            JSON.stringify(
                episodes.map(({ id, number, title, audio }) => ({
                    id,
                    number,
                    title,
                    audio: audio.toSorted(),
                })),
            ),
        )
        .digest('hex');
}
