import { asc, eq, inArray } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import type { AnimeEpisode } from '$lib/anime/types';
import { db } from '$lib/server/db';
import { animeEpisode } from '$lib/server/db/schema';
import { formatDuration } from '$lib/utils';
import type { AniListAnime } from '../anilist/types';
import type { ProviderEpisode } from '../providers/types';

type StoredEpisode = typeof animeEpisode.$inferSelect;

function episodeModel(
    episode: StoredEpisode,
    fallbackDuration: number | null | undefined,
    displayNumber: number
): AnimeEpisode {
    const title =
        episode.metadataTitleSource &&
        episode.metadataTitle &&
        !/^(?:episode|movie)(?:\s+\d+)?$/i.test(episode.metadataTitle)
            ? episode.metadataTitle
            : '';

    return {
        id: episode.episodeId,
        number: episode.number,
        label: `E${displayNumber}`,
        title,
        href: `/anime/${episode.anilistId}/watch/${encodeURIComponent(episode.episodeId)}`,
        audio: episode.audio,
        image: episode.imageUrl,
        duration: formatDuration(episode.runtimeMinutes ?? fallbackDuration),
        releaseDate: episode.airDate ?? '',
        overview: episode.overviewSource ? (episode.overview ?? '') : '',
    };
}

export async function storedEpisodes(anime: AniListAnime) {
    const rows = await db
        .select()
        .from(animeEpisode)
        .where(eq(animeEpisode.anilistId, anime.id))
        .orderBy(asc(animeEpisode.number));
    const sequentialLabels = rows.some(({ number }, index) => number !== index + 1);

    return rows.map((episode, index) =>
        episodeModel(episode, anime.duration, sequentialLabels ? index + 1 : episode.number)
    );
}

export async function storedRelatedReleaseTitles(anilistIds: number[]) {
    const ids = [...new Set(anilistIds)].filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!ids.length) {
        return [];
    }

    const rows = await db
        .select({
            anilistId: animeEpisode.anilistId,
            number: animeEpisode.number,
            title: animeEpisode.metadataTitle,
            titleSource: animeEpisode.metadataTitleSource,
        })
        .from(animeEpisode)
        .where(inArray(animeEpisode.anilistId, ids))
        .orderBy(asc(animeEpisode.anilistId), asc(animeEpisode.number));
    const releases = new Map<number, { number: number; title: string }[]>();

    for (const row of rows) {
        if (!row.titleSource || !row.title?.trim()) {
            continue;
        }

        const release = releases.get(row.anilistId) ?? [];
        release.push({ number: row.number, title: row.title });
        releases.set(row.anilistId, release);
    }

    return [...releases]
        .map(([anilistId, episodes]) => ({ anilistId, episodes }))
        .filter(({ episodes }) => episodes.length);
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
                }))
            )
        )
        .digest('hex');
}
