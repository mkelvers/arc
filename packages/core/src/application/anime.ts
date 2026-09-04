import { episodeAudioAvailabilityLabel, type AudioMode } from '../audio';
import { toAnimeDetails } from '../catalog/details';
import { withMovieBackdrop } from '../catalog/movie-backdrop';
import {
    getEpisodeRevision,
    getRelatedReleaseTitles,
    getStoredAiringSchedule,
    needsEpisodeMetadataRefresh,
} from '../catalog/episodes';
import { getEpisodes } from '../providers/episode-inventory';
import { getAnimeOverview, getAnimeRelease, storedAnimeRelease } from '../catalog/anilist-release';
import { episodesAvailableToWatch } from '../providers/inventory';
import {
    discoverEpisodeInventory,
    ensureEpisodeInventoryBackfill,
    isEpisodeInventoryUnresolvedError,
} from '../catalog/episode-sync';
import { getFranchiseOrder } from '../catalog/franchise';
import {
    isAniKotoNoMatchError,
    isAniKotoTransientError,
    anikotoProvider,
} from '../providers/anikoto';
import { getEpisodeSkipTimes, getSegmentTemplates } from '../playback/skip-times';
import { resolveAnimeSynopsis } from '../catalog/synopsis';
import {
    findMapping,
    getArtwork,
    getStoredMedia,
    refreshArtwork,
    selectArtwork,
    setLogoSize,
} from '../catalog/tmdb';
import { getEpisodePlaybackProgress, getPlaybackProgress } from '../user/progress/store';
import { continuationEpisode, resumePosition } from '../user/progress/continue';
import { getWatchlistState } from '../user/watchlist/store';
import { logger } from './logger';

export async function animePageOverview(userId: string, id: number) {
    const stored = await storedAnimeRelease(id);
    const anime = stored ?? (await getAnimeOverview(id));

    const [storedAiringSchedule, episodeRevision, watchlistState] = await Promise.all([
        getStoredAiringSchedule(id),
        getEpisodeRevision(id),
        getWatchlistState(userId, id),
    ]);

    return {
        anime: toAnimeDetails(anime, anime.description, storedAiringSchedule),
        episodeRevision,
        watchlistState,
    };
}

export async function animePageDeferred(userId: string, id: number) {
    const stored = await storedAnimeRelease(id);
    const imported = !stored;
    const anime = stored ?? (await getAnimeRelease(id));
    const storedMapping = await findMapping(id);
    const storedEpisodes = await getEpisodes(anime);
    const metadataNeedsRefresh = storedMapping
        ? await needsEpisodeMetadataRefresh(id, storedMapping.externalIdId)
        : false;
    const shouldDiscover =
        imported || !storedMapping || storedEpisodes.length === 0 || metadataNeedsRefresh;
    if (shouldDiscover && !imported) {
        await ensureEpisodeInventoryBackfill(id);
    }
    const initialEpisodes = shouldDiscover
        ? await discoverEpisodeInventory(anime)
              .then((entries) => episodesAvailableToWatch(entries, anime))
              .catch((cause) => {
                  if (
                      !isAniKotoTransientError(cause) &&
                      !isAniKotoNoMatchError(cause) &&
                      !isEpisodeInventoryUnresolvedError(cause)
                  ) {
                      throw cause;
                  }
                  return null;
              })
        : null;
    const [synopsis, storedAiringSchedule, watchlist, episodeProgress, watchlistState] =
        await Promise.all([
            resolveAnimeSynopsis(anime, { refresh: imported }),
            getStoredAiringSchedule(id),
            getPlaybackProgress(userId, id),
            getEpisodePlaybackProgress(userId, id),
            getWatchlistState(userId, id),
        ]);
    const episodes = (initialEpisodes ?? storedEpisodes).map((episode) => ({
        ...episode,
        progress: episodeProgress.get(episode.id) ?? null,
    }));
    const details = toAnimeDetails(anime, synopsis, storedAiringSchedule);
    const continuation = continuationEpisode(watchlist, episodes, details.status === 'FINISHED');
    const target = continuation ?? episodes[0] ?? null;
    const allEpisodesCompleted =
        episodes.length > 0 && episodes.every((episode) => episode.progress?.hasCompleted);
    const franchise = anime.idMal ? await getFranchiseOrder(anime.idMal).catch(() => null) : null;

    return {
        anime: details,
        episodes: withMovieBackdrop(anime, episodes, null),
        watchAction: {
            href: target?.href ?? '#anime-episode-list',
            kind: allEpisodesCompleted
                ? 'rewatch'
                : continuation
                  ? 'continue'
                  : watchlist?.completed || watchlistState === 'completed'
                    ? 'rewatch'
                    : target
                      ? 'start'
                      : 'episodes',
            episode: target?.label ?? null,
        },
        audioLabel: episodeAudioAvailabilityLabel(episodes),
        franchise,
    };
}

export async function animePageArtwork(id: number) {
    const stored = await storedAnimeRelease(id);
    const anime = stored ?? (await getAnimeRelease(id));
    const storedMapping = await findMapping(id);
    return getArtwork(anime, { refresh: !storedMapping, fetchMissing: true }).catch(() => null);
}

export async function mediaPage(id: number) {
    const stored = await getStoredMedia(id).catch(() => null);
    if (stored) {
        return stored;
    }

    const existing = await storedAnimeRelease(id);
    const anime = existing ?? (await getAnimeRelease(id));
    return {
        anime: toAnimeDetails(anime),
        artwork: await getArtwork(anime, {
            refresh: true,
            fetchMissing: true,
        }).catch(() => null),
    };
}

type MediaUpdate =
    | { intent: 'refresh' }
    | { intent: 'logoSize'; logoSize: number }
    | { intent: 'select'; type: 'backdrop' | 'logo'; filePath: string | null };

export async function updateMedia(id: number, update: MediaUpdate) {
    if (update.intent === 'refresh') {
        await refreshArtwork(id);
    } else if (update.intent === 'logoSize') {
        await setLogoSize(id, update.logoSize);
    } else {
        await selectArtwork(id, update.type, update.filePath);
    }
}

function legacySlug(title: string, episodeId: string) {
    return (
        title
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || `episode-${episodeId}`
    );
}

async function episodePlayback(
    anime: Parameters<typeof anikotoProvider.getStreams>[0],
    episode: Parameters<typeof anikotoProvider.getStreams>[1],
    modes: AudioMode[]
) {
    try {
        const streams = await anikotoProvider.getStreams(anime, episode, modes);
        return {
            streams,
            error: !Object.values(streams).some((sources) => sources?.length),
        };
    } catch (cause) {
        logger.debug(
            `Playback source resolution failed for AniList ${anime.id} episode ${episode.number}`,
            cause
        );
        return {
            streams: {},
            error: true,
        };
    }
}

async function watchEpisode(id: number, episodeId: string) {
    const anime = await getAnimeRelease(id);
    const episodes = await getEpisodes(anime);
    let currentIndex = episodes.findIndex(({ id: candidate }) => candidate === episodeId);
    let canonicalHref: string | null = null;

    if (currentIndex < 0) {
        const normalizedEpisodeId = episodeId.trim();
        const number = /^\d+(?:\.\d+)?$/.test(normalizedEpisodeId)
            ? Number(normalizedEpisodeId)
            : null;
        if (number !== null && Number.isFinite(number)) {
            const matching = episodes.flatMap((episode, index) =>
                episode.number === number ? [index] : []
            );
            if (matching.length !== 1) {
                return null;
            }
            currentIndex = matching[0];
        }
    }
    if (currentIndex < 0) {
        currentIndex = episodes.findIndex(
            (episode) => legacySlug(episode.title, episode.id) === episodeId
        );
        canonicalHref = currentIndex < 0 ? null : episodes[currentIndex].href;
    }
    if (currentIndex >= 0 && episodeId !== String(episodes[currentIndex].number)) {
        canonicalHref = episodes[currentIndex].href;
    }
    if (currentIndex < 0) {
        return null;
    }

    return { anime, episodes, currentIndex, canonicalHref };
}

export async function watchPage(userId: string, id: number, episodeId: string) {
    const context = await watchEpisode(id, episodeId);
    if (!context) {
        return null;
    }

    const { anime, currentIndex, canonicalHref } = context;
    const [storedMedia, progress, episodeProgress] = await Promise.all([
        getStoredMedia(id).catch(() => null),
        getPlaybackProgress(userId, id),
        getEpisodePlaybackProgress(userId, id),
    ]);
    const episodes = withMovieBackdrop(
        anime,
        context.episodes,
        storedMedia?.artwork.selectedBackdrop?.url
    ).map((episode) => ({
        ...episode,
        progress: episodeProgress.get(episode.id) ?? null,
    }));
    const currentEpisode = episodes[currentIndex];

    return {
        canonicalHref,
        anime: toAnimeDetails(anime),
        poster: storedMedia?.artwork.selectedPoster?.url ?? null,
        logo: storedMedia?.artwork.selectedLogo
            ? {
                  url: storedMedia.artwork.selectedLogo.url,
                  size: storedMedia.artwork.logoSize,
              }
            : null,
        episodes,
        currentEpisode,
        previousEpisode: episodes[currentIndex - 1] ?? null,
        nextEpisode: episodes[currentIndex + 1] ?? null,
        fallbackImage: storedMedia?.artwork.selectedBackdrop?.url ?? anime.bannerImage ?? null,
        startAt: resumePosition(episodeProgress.get(currentEpisode.id) ?? null, currentEpisode.id),
        progressEventAt: Math.max(Date.now(), progress?.eventAt.getTime() ?? 0),
    };
}

export async function watchSegments(id: number, episodeId: string) {
    const context = await watchEpisode(id, episodeId);
    if (!context) {
        return null;
    }

    return Promise.all([
        getEpisodeSkipTimes({
            anilistId: id,
            episodeId: context.episodes[context.currentIndex].id,
            episodeNumber: context.episodes[context.currentIndex].number,
            malId: context.anime.idMal,
        }).catch(() => ({ opening: null, ending: null, source: null })),
        getSegmentTemplates(id, context.episodes[context.currentIndex].number).catch(() => ({
            opening: null,
            ending: null,
        })),
    ]).then(([times, templates]) => ({ times, templates }));
}

export async function watchPlayback(id: number, episodeId: string) {
    const context = await watchEpisode(id, episodeId);
    if (!context) {
        return null;
    }

    const { anime, episodes, currentIndex } = context;
    const currentEpisode = episodes[currentIndex];
    const release = episodes.map(({ number, title }) => ({ number, title }));
    const specials = episodes.filter(({ number }) => number <= 0 || !Number.isInteger(number));
    const specialIndex = specials.findIndex(({ id: candidate }) => candidate === currentEpisode.id);
    const releaseRelations = new Set(['PARENT', 'PREQUEL', 'SEQUEL']);
    const relatedReleases = await getRelatedReleaseTitles(
        (anime.relations?.edges ?? []).flatMap((edge) =>
            edge?.relationType &&
            releaseRelations.has(edge.relationType) &&
            edge.node?.type === 'ANIME' &&
            edge.node.id !== id
                ? [edge.node.id]
                : []
        )
    );
    const playbackEpisode =
        specialIndex < 0
            ? { ...currentEpisode, release, relatedReleases }
            : {
                  ...currentEpisode,
                  release,
                  relatedReleases,
                  specialIndex: specialIndex + 1,
                  specialCount: specials.length,
              };

    return episodePlayback(anime, playbackEpisode, [
        'sub',
        'dub',
        ...(currentEpisode.audio.includes('raw') ? (['raw'] as const) : []),
    ]);
}
