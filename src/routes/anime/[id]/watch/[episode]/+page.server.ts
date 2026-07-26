import { error, redirect } from '@sveltejs/kit';
import { Effect, Either } from 'effect';

import type { AudioMode } from '$lib/anime';
import { anime } from '$lib/server/anime';
import { toAnimeDetails } from '$lib/server/anime/details';
import type { PageServerLoad } from './$types';

function animeId(value: string) {
    const id = Number(value);

    if (!Number.isSafeInteger(id) || id <= 0) error(400, 'Invalid anime ID');

    return id;
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

async function getPlayback(
    animeData: Parameters<typeof anime.allanime.getStreams>[0],
    episode: string,
    modes: AudioMode[],
) {
    let remoteStreams: Awaited<
        ReturnType<typeof anime.allanime.getStreams>
    > = {};
    let streamError = false;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            remoteStreams = await anime.allanime.getStreams(
                animeData,
                episode,
                modes,
            );
            streamError = false;
            break;
        } catch (cause) {
            streamError = true;
            console.error(
                `AllAnime stream attempt ${attempt + 1} failed`,
                cause,
            );

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

    return {
        streams: Object.fromEntries(
            Object.entries(remoteStreams).map(([mode, sources]) => [
                mode,
                sources.map(({ url, quality }) => ({
                    url: `/api/watch/stream?${new URLSearchParams({ url })}`,
                    quality,
                })),
            ]),
        ),
        streamError,
    };
}

export const load: PageServerLoad = async ({ params }) => {
    const id = animeId(params.id);
    const result = await Effect.runPromise(
        anime.anilist.getAnime(id).pipe(Effect.either),
    );

    if (Either.isLeft(result)) {
        error(
            result.left.status === 404 ? 404 : 502,
            result.left.status === 404
                ? 'This anime is no longer available on AniList'
                : result.left.message,
        );
    }

    const [storedMedia, episodes] = await Promise.all([
        anime.tmdb.getStoredMedia(id).catch(() => null),
        anime.episodes.getEpisodes(result.right).catch(() => []),
    ]);
    let currentIndex = episodes.findIndex(
        (episode) => episode.id === params.episode,
    );

    if (currentIndex < 0) {
        currentIndex = episodes.findIndex(
            (episode) =>
                legacySlug(episode.title, episode.id) === params.episode,
        );
        if (currentIndex >= 0) redirect(308, episodes[currentIndex].href);
    }
    if (currentIndex < 0) error(404, 'Episode not found');

    const currentEpisode = episodes[currentIndex];
    return {
        anime: toAnimeDetails(result.right),
        episodes,
        currentEpisode,
        previousEpisode: episodes[currentIndex - 1] ?? null,
        nextEpisode: episodes[currentIndex + 1] ?? null,
        fallbackImage:
            storedMedia?.artwork.selectedBackdrop?.url ??
            result.right.bannerImage ??
            null,
        playback: getPlayback(
            result.right,
            currentEpisode.id,
            currentEpisode.audio,
        ),
    };
};
