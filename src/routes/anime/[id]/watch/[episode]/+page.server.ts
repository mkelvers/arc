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
    const remoteStreams = await anime.allanime
        .getStreams(result.right, currentEpisode.id, modes)
        .catch(() => ({}));
    const streams = Object.fromEntries(
        Object.entries(remoteStreams).map(([mode, url]) => [
            mode,
            `/api/watch/stream?${new URLSearchParams({ url })}`,
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
    };
};
