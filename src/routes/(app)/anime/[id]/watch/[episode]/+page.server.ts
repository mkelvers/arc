import { error, redirect } from '@sveltejs/kit';

import type { AudioMode } from '$lib/anime/audio';
import { toAnimeDetails } from '$lib/server/anime/details';
import { getEpisodes, getRelatedReleaseTitles } from '$lib/server/anime/episodes';
import { recordAnimeVisit } from '$lib/server/anime/interest';
import { playback } from '$lib/server/anime/providers';
import { animeId, loadAnime } from '$lib/server/anime/route';
import { getEpisodeSkipTimes, getSegmentTemplates } from '$lib/server/anime/skip-times';
import { getStoredMedia } from '$lib/server/anime/tmdb/media';
import { resumePosition } from '$lib/server/playback-progress/continue';
import { getPlaybackProgress } from '$lib/server/playback-progress/store';
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

function playbackFailureSummary(cause: AggregateError) {
    return [
        ...new Set(
            cause.errors.map((error) => (error instanceof Error ? error.message : String(error)))
        ),
    ].join('; ');
}

async function getPlayback(
    animeData: Parameters<typeof playback.getStreams>[0],
    episode: Parameters<typeof playback.getStreams>[1],
    modes: AudioMode[]
) {
    let remoteStreams: Awaited<ReturnType<typeof playback.getStreams>> = {};
    let failed = false;

    try {
        remoteStreams = await playback.getStreams(animeData, episode, modes);
    } catch (cause) {
        failed = true;
        if (cause instanceof AggregateError) {
            console.warn(
                `Playback unavailable for AniList ${animeData.id}, episode ${episode.id}: ${playbackFailureSummary(cause)}`
            );
        } else {
            console.error(
                `Unexpected playback failure for AniList ${animeData.id}, episode ${episode.id}`,
                cause
            );
        }
    }

    return {
        streams: Object.fromEntries(
            Object.entries(remoteStreams).map(([mode, sources]) => [
                mode,
                (sources ?? []).map(({ url, quality, audioDelay, subtitleUrl, provider }) => ({
                    url: `/api/episodes/stream?${new URLSearchParams({ url })}`,
                    quality,
                    audioDelay,
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
    // These requests may reach fetch after their initial cache/DB reads. Settle
    // them in load so they cannot start network work during component SSR.
    const [skipTimes, segmentTemplates, playback] = await Promise.all([
        getEpisodeSkipTimes({
            anilistId: id,
            episodeId: currentEpisode.id,
            episodeNumber: currentEpisode.number,
            malId: result.idMal,
        }),
        getSegmentTemplates(id, currentEpisode.number),
        getPlayback(result, playbackEpisode, [
            'sub',
            'dub',
            ...(currentEpisode.audio.includes('raw') ? (['raw'] as const) : []),
        ]),
    ]);

    return {
        pageTitle:
            details.format === 'Movie'
                ? `Watch ${details.title}`
                : `Watch ${details.title} — ${
                      currentEpisode.title
                          ? `${currentEpisode.label} – ${currentEpisode.title}`
                          : currentEpisode.label
                  }`,
        anime: details,
        poster: storedMedia?.artwork.selectedPoster?.url ?? null,
        episodes,
        currentEpisode,
        previousEpisode: episodes[currentIndex - 1] ?? null,
        nextEpisode: episodes[currentIndex + 1] ?? null,
        fallbackImage: storedMedia?.artwork.selectedBackdrop?.url ?? result.bannerImage ?? null,
        // WatchPlayer keeps promise props to coordinate client transitions.
        segments: {
            canEdit: Boolean(locals.user),
            times: Promise.resolve(skipTimes),
            templates: Promise.resolve(segmentTemplates),
        },
        startAt: resumePosition(progress, currentEpisode.id),
        progressEventAt: Math.max(Date.now(), progress?.eventAt.getTime() ?? 0),
        playback: Promise.resolve(playback),
    };
};
