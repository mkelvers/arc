import { asc, eq, inArray } from 'drizzle-orm';

import { db } from '@arc/shared/db';
import { animeEpisode } from '@arc/shared/db/schema';
import type { AniListAnime } from '../catalog/anilist-types';
import { episodesAvailableToWatch } from './inventory';
import type { AudioMode } from '../audio';
import type { AnimeEpisode } from '../types';
import { watchEpisodeHref } from '../catalog/episode-route';

function formatDuration(minutes: number | null | undefined) {
    if (!minutes || minutes <= 0) {
        return '';
    }

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (!hours) {
        return `${remainder}m`;
    }

    return remainder ? `${hours}h, ${remainder}m` : `${hours}h`;
}

function episodeModel(
    episode: typeof animeEpisode.$inferSelect,
    fallbackDuration: number | null | undefined
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
        label: `E${episode.number}`,
        title,
        href: watchEpisodeHref(episode.anilistId, episode.number),
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
    const uniqueEpisodes = new Map<number, (typeof rows)[number]>();

    for (const episode of rows.filter(({ episodeId }) => episodeId.includes(':'))) {
        if (!uniqueEpisodes.has(episode.number)) {
            uniqueEpisodes.set(episode.number, episode);
        }
    }

    return [...uniqueEpisodes.values()].map((episode) => episodeModel(episode, anime.duration));
}

export async function getEpisodes(anime: AniListAnime) {
    return episodesAvailableToWatch(await storedEpisodes(anime), anime);
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
