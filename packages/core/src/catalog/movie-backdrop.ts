import type { AnimeEpisode } from '../types';

export function withMovieBackdrop(
    anime: {
        format: string | null,
    },
    episodes: AnimeEpisode[],
    backdrop: string | null | undefined
) {
    if (anime.format !== 'MOVIE' || !backdrop) {
        return episodes;
    }

    return episodes.map((episode) => ({ ...episode, image: backdrop }));
}
