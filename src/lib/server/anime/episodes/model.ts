import { asc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import type { AnimeEpisode } from '$lib/anime/types';
import { db } from '$lib/server/db';
import { animeEpisode } from '$lib/server/db/schema';
import { formatDuration } from '$lib/utils';
import type { ProviderEpisode } from '../providers/types';
import type { AniListAnime, StoredEpisode } from './types';

function episodeModel(
    episode: StoredEpisode,
    fallbackDuration: number | null | undefined,
    displayNumber: number,
): AnimeEpisode {
    const genericMetadataTitle =
        episode.metadataTitle &&
        /^(?:episode|movie)(?:\s+\d+)?$/i.test(
            episode.metadataTitle,
        );
    const title =
        (genericMetadataTitle
            ? episode.providerTitle
            : episode.metadataTitle) ||
        episode.providerTitle ||
        episode.metadataTitle ||
        `Episode ${episode.episodeId}`;

    return {
        id: episode.episodeId,
        number: episode.number,
        label: `E${displayNumber}`,
        title,
        href: `/anime/${episode.anilistId}/watch/${encodeURIComponent(episode.episodeId)}`,
        audio: episode.audio,
        image: episode.imageUrl,
        duration: formatDuration(
            episode.runtimeMinutes ?? fallbackDuration,
        ),
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
    const sequentialLabels = rows.some(
        ({ number }, index) => number !== index + 1,
    );

    return rows.map((episode, index) =>
        episodeModel(
            episode,
            anime.duration,
            sequentialLabels ? index + 1 : episode.number,
        ),
    );
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
