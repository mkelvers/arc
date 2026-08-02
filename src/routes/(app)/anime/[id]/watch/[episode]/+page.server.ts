import { error, redirect } from '@sveltejs/kit';

import type { AudioMode } from '$lib/anime/audio';
import { anime } from '$lib/server/anime';
import { toAnimeDetails } from '$lib/server/anime/details';
import { animeId, loadAnime } from '$lib/server/anime/route';
import { getEpisodeSkipTimes } from '$lib/server/anime/skip-times';
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
            cause.errors.map((error) =>
                error instanceof Error ? error.message : String(error),
            ),
        ),
    ].join('; ');
}

async function getPlayback(
    animeData: Parameters<typeof anime.playback.getStreams>[0],
    episode: Parameters<typeof anime.playback.getStreams>[1],
    modes: AudioMode[],
) {
    let remoteStreams: Awaited<
        ReturnType<typeof anime.playback.getStreams>
    > = {};
    let streamError = false;
    let lastFailure: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            remoteStreams = await anime.playback.getStreams(
                animeData,
                episode,
                modes,
            );
            streamError = false;
            lastFailure = undefined;
            break;
        } catch (cause) {
            streamError = true;
            lastFailure = cause;

            if (attempt === 0) {
                const errors =
                    cause instanceof AggregateError ? cause.errors : [cause];
                const retryAfter = Math.max(
                    0,
                    ...errors.map((error) =>
                        error instanceof Error
                            ? Number(
                                  error.message.match(
                                      /try again in (\d+) seconds?/i,
                                  )?.[1] ?? 0,
                              )
                            : 0,
                    ),
                );

                if (retryAfter) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, Math.min(retryAfter, 5) * 1_000),
                    );
                } else {
                    break;
                }
            }
        }
    }

    if (lastFailure instanceof AggregateError) {
        console.warn(
            `Playback unavailable for AniList ${animeData.id}, episode ${episode.id}: ${playbackFailureSummary(lastFailure)}`,
        );
    } else if (lastFailure !== undefined) {
        console.error(
            `Unexpected playback failure for AniList ${animeData.id}, episode ${episode.id}`,
            lastFailure,
        );
    }

    return {
        streams: Object.fromEntries(
            Object.entries(remoteStreams).map(([mode, sources]) => [
                mode,
                (sources ?? []).map(
                    ({
                        url,
                        quality,
                        audioDelay,
                        subtitleUrl,
                        provider,
                    }) => ({
                        url: `/api/watch/stream?${new URLSearchParams({
                            url,
                            v: '2',
                        })}`,
                        quality,
                        audioDelay,
                        provider,
                        subtitleUrl: subtitleUrl
                            ? `/api/watch/stream?${new URLSearchParams({
                                  url: subtitleUrl,
                                  v: '2',
                              })}`
                            : null,
                    }),
                ),
            ]),
        ),
        streamError,
    };
}

export const load: PageServerLoad = async ({ params, locals }) => {
    const id = animeId(params.id);
    if (!id) {
        error(400, 'Invalid anime ID');
    }
    const result = await loadAnime(id);

    const [storedMedia, episodes, progress] = await Promise.all([
        anime.tmdb.getStoredMedia(id).catch(() => null),
        anime.episodes.getEpisodes(result).catch(() => []),
        getPlaybackProgress(locals.user?.id, id),
    ]);
    let currentIndex = episodes.findIndex(
        (episode) => episode.id === params.episode,
    );

    if (currentIndex < 0) {
        currentIndex = episodes.findIndex(
            (episode) =>
                legacySlug(episode.title, episode.id) === params.episode,
        );
        if (currentIndex >= 0) {
            redirect(308, episodes[currentIndex].href);
        }
    }

    if (currentIndex < 0) {
        error(404, 'Episode not found');
    }

    const currentEpisode = episodes[currentIndex];
    const specials = episodes.filter(
        ({ number }) => number <= 0 || !Number.isInteger(number),
    );
    const specialIndex = specials.findIndex(
        ({ id: episodeId }) => episodeId === currentEpisode.id,
    );
    const playbackEpisode =
        specialIndex < 0
            ? currentEpisode
            : {
                  ...currentEpisode,
                  specialIndex: specialIndex + 1,
                  specialCount: specials.length,
              };
    // These requests may reach fetch after their initial cache/DB reads. Settle
    // them in load so they cannot start network work during component SSR.
    const [skipTimes, playback] = await Promise.all([
        getEpisodeSkipTimes({
            anilistId: id,
            episodeId: currentEpisode.id,
            episodeNumber: currentEpisode.number,
            malId: result.idMal,
        }),
        getPlayback(
            result,
            playbackEpisode,
            [
                'sub',
                'dub',
                ...(currentEpisode.audio.includes('raw')
                    ? (['raw'] as const)
                    : []),
            ],
        ),
    ]);

    return {
        anime: toAnimeDetails(result),
        episodes,
        currentEpisode,
        previousEpisode: episodes[currentIndex - 1] ?? null,
        nextEpisode: episodes[currentIndex + 1] ?? null,
        fallbackImage:
            storedMedia?.artwork.selectedBackdrop?.url ??
            result.bannerImage ??
            null,
        canEditSkipTimes: Boolean(locals.user),
        // WatchPlayer keeps promise props to coordinate client transitions.
        skipTimes: Promise.resolve(skipTimes),
        startAt: resumePosition(progress, currentEpisode.id),
        playback: Promise.resolve(playback),
    };
};
