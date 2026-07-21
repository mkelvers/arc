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

    const remoteStreamUrl = await anime.allanime
        .getStream(result.right, episodes[currentIndex].id)
        .catch(() => null);
    const streamUrl = remoteStreamUrl
        ? `/api/watch/stream?${new URLSearchParams({ url: remoteStreamUrl })}`
        : null;

    return {
        anime: toAnimeDetails(result.right),
        episodes,
        currentEpisode: episodes[currentIndex],
        previousEpisode: episodes[currentIndex - 1] ?? null,
        nextEpisode: episodes[currentIndex + 1] ?? null,
        fallbackImage: artwork.selectedBackdrop?.url ?? null,
        streamUrl,
    };
};
