import { asc, eq, inArray } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import type { AudioMode } from '@arc/shared/audio';
import type { AnimeEpisode } from '@arc/shared/types';
import { db } from '@arc/db';
import { animeEpisode } from '@arc/db/schema';
import { formatDuration } from '../../utils';
import type { AniListAnime } from '../anilist/types';
import { availableEpisodeCount } from './policy';

function episodeModel(
    episode: typeof animeEpisode.$inferSelect,
    fallbackDuration: number | null | undefined,
    displayNumber: number
): AnimeEpisode {
    const metadataTitle =
        episode.metadataTitleSource &&
        episode.metadataTitle &&
        !/^(?:episode|movie)(?:\s+\d+)?$/i.test(episode.metadataTitle)
            ? episode.metadataTitle
            : '';
    const providerTitle = episode.providerTitle?.trim() ?? '';
    const title =
        metadataTitle ||
        (/^(?:episode|movie)(?:\s+\d+)?$/i.test(providerTitle) ? '' : providerTitle);

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
        type: episode.classification,
    };
}

export async function storedEpisodes(anime: AniListAnime) {
    const rows = await db
        .select()
        .from(animeEpisode)
        .where(eq(animeEpisode.anilistId, anime.id))
        .orderBy(asc(animeEpisode.number));
    const available = availableEpisodeCount(anime);
    const sequentialLabels =
        (available === null || rows.length >= available) &&
        rows.some(({ number }, index) => number !== index + 1);

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

export async function storedAudioModes(anilistIds: number[]) {
    const ids = [...new Set(anilistIds)];
    if (!ids.length) {
        return new Map<number, Set<AudioMode>>();
    }

    const rows = await db
        .select({ anilistId: animeEpisode.anilistId, audio: animeEpisode.audio })
        .from(animeEpisode)
        .where(inArray(animeEpisode.anilistId, ids));
    const audioByAnime = new Map<number, Set<AudioMode>>();

    for (const row of rows) {
        const audio = audioByAnime.get(row.anilistId) ?? new Set<AudioMode>();
        row.audio.forEach((mode) => audio.add(mode));
        audioByAnime.set(row.anilistId, audio);
    }

    return audioByAnime;
}

export function sourceRevision(
    episodes: ReadonlyArray<{
        id: string;
        number: number;
        title: string;
        audio: AudioMode[];
        type?: string | null;
    }>
) {
    return createHash('sha256')
        .update(
            JSON.stringify(
                episodes.map(({ id, number, title, audio, type }) => ({
                    id,
                    number,
                    title,
                    audio: audio.toSorted(),
                    type: type ?? 'unknown',
                }))
            )
        )
        .digest('hex');
}
