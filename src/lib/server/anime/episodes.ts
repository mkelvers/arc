import { eq } from 'drizzle-orm';

import { formatAudioLabel, type AnimeEpisode } from '$lib/anime';
import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';
import { db } from '$lib/server/db';
import { animeEpisodeCache } from '$lib/server/db/schema';
import { allanime } from './allanime';
import { tmdb } from './tmdb';

type AniListAnime = NonNullable<AnimeQuery['Media']>;
const cacheVersion = 2;
const cacheLifetime = 30 * 60 * 1_000;
const requests = new Map<number, Promise<AnimeEpisode[]>>();

function duration(minutes: number | null | undefined) {
    if (!minutes || minutes <= 0) return '';

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (!hours) return `${remainder}m`;
    if (!remainder) return `${hours}h`;
    return `${hours}h, ${remainder}m`;
}

async function fetchEpisodes(anime: AniListAnime): Promise<AnimeEpisode[]> {
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
            audioLabel: formatAudioLabel(episode.hasSub, episode.hasDub),
            imageUrl: media?.imageUrl ?? null,
            duration: duration(media?.runtime ?? anime.duration),
            airDate: media?.airDate ?? '',
            overview: media?.overview ?? '',
        };
    });
}

async function refreshEpisodes(anime: AniListAnime) {
    const pending = requests.get(anime.id);
    if (pending) return pending;

    const request = fetchEpisodes(anime).then(async (episodes) => {
        await db
            .insert(animeEpisodeCache)
            .values({
                anilistId: anime.id,
                episodes,
                version: cacheVersion,
                fetchedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: animeEpisodeCache.anilistId,
                set: {
                    episodes,
                    version: cacheVersion,
                    fetchedAt: new Date(),
                },
            });

        return episodes;
    });
    requests.set(anime.id, request);

    try {
        return await request;
    } finally {
        requests.delete(anime.id);
    }
}

async function getEpisodes(anime: AniListAnime): Promise<AnimeEpisode[]> {
    const [cached] = await db
        .select({
            episodes: animeEpisodeCache.episodes,
            version: animeEpisodeCache.version,
            fetchedAt: animeEpisodeCache.fetchedAt,
        })
        .from(animeEpisodeCache)
        .where(eq(animeEpisodeCache.anilistId, anime.id))
        .limit(1);

    if (cached?.version === cacheVersion) {
        if (Date.now() - cached.fetchedAt.getTime() > cacheLifetime) {
            void refreshEpisodes(anime).catch((cause) =>
                console.error(
                    `Episode refresh failed for AniList ${anime.id}`,
                    cause,
                ),
            );
        }

        return cached.episodes;
    }

    return refreshEpisodes(anime);
}

export const episodes = { getEpisodes };
