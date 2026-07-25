import { error } from '@sveltejs/kit';
import { Effect, Either } from 'effect';

import { anime } from '$lib/server/anime';
import { toAnimeDetails } from '$lib/server/anime/details';
import type { PageServerLoad } from './$types';

function animeId(value: string) {
    const id = Number(value);

    if (!Number.isSafeInteger(id) || id <= 0) error(400, 'Invalid anime ID');

    return id;
}

export const load: PageServerLoad = async ({ params }) => {
    const id = animeId(params.id);
    const result = await Effect.runPromise(
        anime.anilist.getAnime(id).pipe(Effect.either),
    );

    if (Either.isLeft(result)) error(502, result.left.message);

    const [artwork, episodes] = await Promise.all([
        anime.tmdb.getArtwork(result.right).catch(() => ({
            selectedBackdrop: null,
        })),
        anime.episodes.getEpisodes(result.right).catch(() => []),
    ]);
    const currentIndex = episodes.findIndex(
        (episode) => episode.slug === params.episode,
    );

    if (currentIndex < 0) error(404, 'Episode not found');

    const currentEpisode = episodes[currentIndex];
    const modes: ('sub' | 'dub')[] = [];
    if (currentEpisode.hasSub) modes.push('sub');
    if (currentEpisode.hasDub) modes.push('dub');
    let remoteStreams: Awaited<
        ReturnType<typeof anime.allanime.getStreams>
    > = {};
    let streamError = false;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            remoteStreams = await anime.allanime.getStreams(
                result.right,
                currentEpisode.id,
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

    const streams = Object.fromEntries(
        Object.entries(remoteStreams).map(([mode, sources]) => [
            mode,
            sources.map(({ url, quality }) => ({
                url: `/api/watch/stream?${new URLSearchParams({ url })}`,
                quality,
            })),
        ]),
    );

    return {
        anime: toAnimeDetails(result.right),
        episodes,
        currentEpisode,
        previousEpisode: episodes[currentIndex - 1] ?? null,
        nextEpisode: episodes[currentIndex + 1] ?? null,
        fallbackImage: artwork.selectedBackdrop?.url ?? null,
        streams,
        streamError,
    };
};
