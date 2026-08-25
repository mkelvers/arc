import { audioAvailabilityLabel, episodeAudioAvailabilityLabel } from '@arc/shared/audio';
import type { AudioMode } from '@arc/shared/audio';
import { availableAnimeSeasons, compareAnimeSeasons, currentAnimeSeason } from '@arc/shared/season';
import { getHomepage } from './anilist/home';
import { getPopularAudioLabels } from './allanime/catalog';
import { enrichAnimeCards } from './card-enrichment';
import { toAnimeDetails } from './details';
import {
    getEpisodeRevision,
    getEpisodes,
    getRelatedReleaseTitles,
    getStoredAiringSchedule,
    withMovieBackdrop,
} from './episodes';
import { storedAudioModes } from './episodes/model';
import { getFranchiseOrder } from './franchise';
import { getHomeHero } from './home';
import { playback } from './providers';
import { getEpisodeSkipTimes, getSegmentTemplates } from './skip-times';
import { resolveAnimeSynopsis } from './synopsis';
import { getArtwork } from './tmdb/artwork';
import { getStoredMedia, refreshArtwork, selectArtwork, setLogoSize } from './tmdb/media';
import { getAnime } from './anilist/details';
import { getContinueWatchingCards, getPlaybackProgress } from '../progress/store';
import { continuationEpisode, resumePosition } from '../progress/continue';
import { getSimulcastSeasonStarts } from './anilist/simulcast';
import { requestedSimulcastSeason, simulcastPage } from './simulcast';
import { getWatchlistState } from '../watchlist/store';

export async function homePage(userId: string) {
    const { season, year } = currentAnimeSeason();
    const homepage = await getHomepage(season, year);
    const animeIds = [...new Set([...homepage.season, ...homepage.popular].map(({ id }) => id))];
    const [highlights, continueWatching, audioByAnime, popularAudio] = await Promise.all([
        getHomeHero().catch(() => []),
        getContinueWatchingCards(userId).catch(() => []),
        storedAudioModes(animeIds),
        getPopularAudioLabels().catch(() => new Map()),
    ]);
    const withAudio = (card: (typeof homepage.season)[number]) => ({
        ...card,
        audioLabel: audioAvailabilityLabel([
            ...(audioByAnime.get(card.id) ?? []),
            ...(popularAudio.get(card.id) ?? []),
        ]),
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
    const anime = await getAnime(id);
    const [synopsis, storedAiringSchedule, episodes, watchlist] = await Promise.all([
        resolveAnimeSynopsis(anime),
        getStoredAiringSchedule(id),
        getEpisodes(anime),
        getPlaybackProgress(userId, id),
    ]);
    const details = toAnimeDetails(anime, synopsis, storedAiringSchedule);
    const continuation = continuationEpisode(watchlist, episodes, details.status === 'FINISHED');
    const target = continuation ?? episodes[0] ?? null;
    const [artwork, franchise, watchlistState] = await Promise.all([
        getArtwork(anime).catch(() => null),
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
            label: continuation
                ? `Continue watching ${continuation.label}`
                : target
                  ? `Start watching ${target.label}`
                  : 'View episodes',
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

    const anime = await getAnime(id);
    return {
        anime: toAnimeDetails(anime),
        artwork: await getArtwork(anime).catch(() => null),
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

export async function simulcast(selection: URLSearchParams, page: number) {
    const current = currentAnimeSeason();
    const selected = requestedSimulcastSeason(selection, current);
    if (!selected || compareAnimeSeasons(selected, current) > 0) {
        return null;
    }

    const [starts, result] = await Promise.all([
        getSimulcastSeasonStarts(),
        simulcastPage(selected, page),
    ]);
    const seasons = availableAnimeSeasons(starts, current);
    if (!seasons.some(({ season, year }) => season === selected.season && year === selected.year)) {
        return null;
    }
    const label = `${selected.season[0]}${selected.season.slice(1).toLowerCase()} ${selected.year}`;

    return {
        season: selected.season,
        year: selected.year,
        label,
        options: seasons
            .map((option) => ({
                ...option,
                label: `${option.season[0]}${option.season.slice(1).toLowerCase()} ${option.year}`,
                current: option.season === selected.season && option.year === selected.year,
                href:
                    compareAnimeSeasons(option, current) === 0
                        ? '/simulcast'
                        : `/simulcast?season=${option.season.toLowerCase()}&year=${option.year}`,
            }))
            .toReversed(),
        page: result,
    };
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
    anime: Parameters<typeof playback.getStreams>[0],
    episode: Parameters<typeof playback.getStreams>[1],
    modes: AudioMode[]
) {
    try {
        const streams = await playback.getStreams(anime, episode, modes);
        const missing = modes.filter((mode) => !streams[mode]?.length);
        if (missing.length) {
            console.warn(
                `Playback modes unavailable for AniList ${anime.id} episode ${episode.number}: ${missing.join(', ')}`
            );
        }
        return {
            streams,
            error: !Object.values(streams).some((sources) => sources?.length),
        };
    } catch (cause) {
        console.error(
            `Playback source resolution failed for AniList ${anime.id} episode ${episode.number}`,
            cause
        );
        return { streams: {}, error: true };
    }
}

async function watchEpisode(id: number, episodeId: string) {
    const anime = await getAnime(id);
    const episodes = await getEpisodes(anime);
    let currentIndex = episodes.findIndex(({ id: candidate }) => candidate === episodeId);
    let canonicalHref: string | null = null;

    if (currentIndex < 0) {
        currentIndex = episodes.findIndex(
            (episode) => legacySlug(episode.title, episode.id) === episodeId
        );
        canonicalHref = currentIndex < 0 ? null : episodes[currentIndex].href;
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
