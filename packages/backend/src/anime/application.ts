import { audioAvailabilityLabel, episodeAudioAvailabilityLabel } from '@arc/shared/audio';
import type { AudioMode } from '@arc/shared/audio';
import { currentAnimeSeason } from '@arc/shared/season';
import { getHomepage } from './anilist/home';
import { enrichAnimeCards } from './card-enrichment';
import { toAnimeDetails } from './details';
import {
    getEpisodeRevision,
    getEpisodes,
    getRelatedReleaseTitles,
    getStoredAiringSchedule,
    withMovieBackdrop,
} from './episodes';
import { episodeInventoryNeedsDiscovery, episodesAvailableToWatch } from './episodes/policy';
import { discoverEpisodeInventory, ensureEpisodeInventoryBackfill } from './episodes/sync';
import { storedAudioModes } from './episodes/model';
import { getFranchiseOrder } from './franchise';
import { getHomeHero } from './home';
import { isAniKotoTransientError, anikotoProvider } from './providers/anikoto';
import { getEpisodeSkipTimes, getSegmentTemplates } from './skip-times';
import { watchEpisodeNumber } from './episodes/route';
import { resolveAnimeSynopsis } from './synopsis';
import { getArtwork } from './tmdb/artwork';
import { findMapping } from './tmdb/mapping-store';
import { getStoredMedia, refreshArtwork, selectArtwork, setLogoSize } from './tmdb/media';
import { getAnimeRelease, storedAnimeRelease } from './anilist/releases';
import { getContinueWatchingCards, getPlaybackProgress } from '../progress/store';
import { continuationEpisode, resumePosition } from '../progress/continue';
import { getWatchlistState } from '../watchlist/store';
import { logger } from '@arc/backend/internal/logger';

export async function homePage(userId: string) {
    const { season, year } = currentAnimeSeason();
    const homepage = await getHomepage(season, year);
    const animeIds = [...new Set([...homepage.season, ...homepage.popular].map(({ id }) => id))];
    const [highlights, continueWatching, audioByAnime] = await Promise.all([
        getHomeHero().catch(() => []),
        getContinueWatchingCards(userId).catch(() => []),
        storedAudioModes(animeIds),
    ]);
    const withAudio = (card: (typeof homepage.season)[number]) => ({
        ...card,
        audioLabel: audioAvailabilityLabel([...(audioByAnime.get(card.id) ?? [])]),
    });
    const seasonCards = homepage.season.map(withAudio);
    const cards = await enrichAnimeCards([...seasonCards, ...homepage.popular.map(withAudio)]);

    return {
        highlights,
        season: cards.slice(0, seasonCards.length),
        popular: cards.slice(seasonCards.length),
        continueWatching,
    };
}

export async function animePage(userId: string, id: number) {
    const stored = await storedAnimeRelease(id);
    const imported = !stored;
    const anime = stored ?? (await getAnimeRelease(id));
    const storedMapping = await findMapping(id);
    const storedEpisodes = await getEpisodes(anime);
    const shouldDiscover =
        imported || !storedMapping || episodeInventoryNeedsDiscovery(anime, storedEpisodes);
    const initialEpisodes =
        shouldDiscover && imported
            ? await discoverEpisodeInventory(anime)
                  .then((entries) => episodesAvailableToWatch(entries, anime))
                  .catch((cause) => {
                      if (!isAniKotoTransientError(cause)) {
                          throw cause;
                      }
                      return null;
                  })
            : null;
    if (shouldDiscover && !imported) {
        await ensureEpisodeInventoryBackfill(id);
        void discoverEpisodeInventory(anime).catch((cause) => {
            if (!isAniKotoTransientError(cause)) {
                logger.debug(`Episode inventory repair failed for AniList ${id}`, cause);
            }
        });
    }
    const [synopsis, storedAiringSchedule, watchlist] = await Promise.all([
        resolveAnimeSynopsis(anime, { refresh: imported }),
        getStoredAiringSchedule(id),
        getPlaybackProgress(userId, id),
    ]);
    const episodes = initialEpisodes ?? storedEpisodes;
    const details = toAnimeDetails(anime, synopsis, storedAiringSchedule);
    const continuation = continuationEpisode(watchlist, episodes, details.status === 'FINISHED');
    const target = continuation ?? episodes[0] ?? null;
    const [artwork, franchise, watchlistState] = await Promise.all([
        getArtwork(anime, { refresh: imported || !storedMapping, fetchMissing: true }).catch(
            () => null
        ),
        anime.idMal ? getFranchiseOrder(anime.idMal).catch(() => null) : null,
        getWatchlistState(userId, id),
    ]);

    return {
        anime: details,
        artwork,
        episodes: withMovieBackdrop(anime, episodes, artwork?.selectedBackdrop?.url),
        episodeRevision: await getEpisodeRevision(id),
        watchAction: {
            href: target?.href ?? '#anime-episode-list',
            kind: continuation ? 'continue' : target ? 'start' : 'episodes',
            episode: target?.label ?? null,
        },
        audioLabel: episodeAudioAvailabilityLabel(episodes),
        franchise,
        watchlistState,
    };
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
        artwork: await getArtwork(anime, { refresh: true, fetchMissing: true }).catch(() => null),
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
        return { streams: {}, error: true };
    }
}

async function watchEpisode(id: number, episodeId: string) {
    const anime = await getAnimeRelease(id);
    const episodes = await getEpisodes(anime);
    let currentIndex = episodes.findIndex(({ id: candidate }) => candidate === episodeId);
    let canonicalHref: string | null = null;

    if (currentIndex < 0) {
        const number = watchEpisodeNumber(episodeId);
        if (number !== null) {
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
    const [storedMedia, progress] = await Promise.all([
        getStoredMedia(id).catch(() => null),
        getPlaybackProgress(userId, id),
    ]);
    const episodes = withMovieBackdrop(
        anime,
        context.episodes,
        storedMedia?.artwork.selectedBackdrop?.url
    );
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
        startAt: resumePosition(progress, currentEpisode.id),
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
