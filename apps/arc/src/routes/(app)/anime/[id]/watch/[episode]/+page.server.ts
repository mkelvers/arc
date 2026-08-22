import { error, redirect } from '@sveltejs/kit';

import type { AudioMode } from '@arc/shared/audio';
import { toAnimeDetails } from '@arc/backend/internal/anime/details';
import { getEpisodes, getRelatedReleaseTitles } from '@arc/backend/internal/anime/episodes';
import { recordAnimeVisit } from '@arc/backend/internal/anime/interest';
import { playback } from '@arc/backend/internal/anime/providers';
import { animeId, loadAnime } from '$lib/server/anime/route';
import { getEpisodeSkipTimes, getSegmentTemplates } from '@arc/backend/internal/anime/skip-times';
import { getStoredMedia } from '@arc/backend/internal/anime/tmdb/media';
import { resumePosition } from '$lib/server/progress/continue';
import { getPlaybackProgress } from '$lib/server/progress/store';
import type { PageServerLoad } from './$types';

// Watch links used title slugs before episode IDs became canonical. Keep this
// redirect while old bookmarks and shared links can still be in circulation.
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

async function getPlayback(
    animeData: Parameters<typeof playback.getStreams>[0],
    episode: Parameters<typeof playback.getStreams>[1],
    modes: AudioMode[]
) {
    let remoteStreams: Awaited<ReturnType<typeof playback.getStreams>> = {};

    try {
        remoteStreams = await playback.getStreams(animeData, episode, modes);
    } catch (cause) {
        if (cause instanceof AggregateError) {
            console.warn(
                `Playback unavailable for AniList ${animeData.id}, episode ${episode.id}: ${[
                    ...new Set(
                        cause.errors.map((error) =>
                            error instanceof Error ? error.message : String(error)
                        )
                    ),
                ].join('; ')}`
            );
        } else {
            console.error(
                `Unexpected playback failure for AniList ${animeData.id}, episode ${episode.id}`,
                cause
            );
        }
    }

    const failed = !Object.values(remoteStreams).some((sources) => sources?.length);

    return {
        streams: Object.fromEntries(
            Object.entries(remoteStreams).map(([mode, sources]) => [
                mode,
                (sources ?? []).map(({ url, kind, quality, subtitleUrl, provider }) => ({
                    url:
                        kind === 'iframe'
                            ? url
                            : `/api/episodes/stream?${new URLSearchParams({ url })}`,
                    kind,
                    quality,
                    provider,
                    subtitleUrl: subtitleUrl
                        ? `/api/episodes/stream?${new URLSearchParams({ url: subtitleUrl })}`
                        : null,
                })),
            ])
        ),
        error: failed,
    };
}

export const load: PageServerLoad = async ({ params, locals }) => {
    const id = animeId(params.id);
    if (!id) {
        error(400, 'Invalid anime ID');
    }
    const result = await loadAnime(id);
    const details = toAnimeDetails(result);
    const releaseRelations = new Set(['PARENT', 'PREQUEL', 'SEQUEL']);
    const relatedIds = (result.relations?.edges ?? []).flatMap((edge) =>
        edge?.relationType &&
        releaseRelations.has(edge.relationType) &&
        edge.node?.type === 'ANIME' &&
        edge.node.id !== id
            ? [edge.node.id]
            : []
    );

    const [storedMedia, episodes, relatedReleases, progress] = await Promise.all([
        getStoredMedia(id).catch(() => null),
        getEpisodes(result).catch(() => []),
        getRelatedReleaseTitles(relatedIds),
        getPlaybackProgress(locals.user?.id, id),
    ]);
    await recordAnimeVisit(locals.user?.id, id);
    let currentIndex = episodes.findIndex((episode) => episode.id === params.episode);

    if (currentIndex < 0) {
        currentIndex = episodes.findIndex(
            (episode) => legacySlug(episode.title, episode.id) === params.episode
        );
        if (currentIndex >= 0) {
            redirect(308, episodes[currentIndex].href);
        }
    }

    if (currentIndex < 0) {
        error(404, 'Episode not found');
    }

    const currentEpisode = episodes[currentIndex];
    const release = episodes.map(({ number, title }) => ({
        number,
        title,
    }));
    const specials = episodes.filter(({ number }) => number <= 0 || !Number.isInteger(number));
    const specialIndex = specials.findIndex(({ id: episodeId }) => episodeId === currentEpisode.id);
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
    // Keep the watch shell and player transition independent from enrichment
    // and stream verification. WatchPlayer consumes these promises as they
    // settle, so none of them should delay the initial response.
    const skipTimes = getEpisodeSkipTimes({
        anilistId: id,
        episodeId: currentEpisode.id,
        episodeNumber: currentEpisode.number,
        malId: result.idMal,
    }).catch(() => ({ opening: null, ending: null, source: null }));
    const segmentTemplates = getSegmentTemplates(id, currentEpisode.number).catch(() => ({
        opening: null,
        ending: null,
    }));
    const playbackPromise = getPlayback(result, playbackEpisode, [
        'sub',
        'dub',
        ...(currentEpisode.audio.includes('raw') ? (['raw'] as const) : []),
    ]);

    return {
        anime: details,
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
        fallbackImage: storedMedia?.artwork.selectedBackdrop?.url ?? result.bannerImage ?? null,
        // WatchPlayer keeps promise props to coordinate client transitions.
        segments: {
            canEdit: locals.user !== undefined,
            times: skipTimes,
            templates: segmentTemplates,
        },
        startAt: resumePosition(progress, currentEpisode.id),
        progressEventAt: Math.max(Date.now(), progress?.eventAt.getTime() ?? 0),
        playback: playbackPromise,
    };
};
