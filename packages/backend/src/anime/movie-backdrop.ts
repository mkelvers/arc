import type { AnimeEpisode } from '@arc/shared/types';

export function withMovieBackdrop(
    anime: { format: string | null },
    episodes: AnimeEpisode[],
    backdrop: string | null | undefined
) {
    if (anime.format !== 'MOVIE' || !backdrop) {
        return episodes;
    }

    return episodes.map((episode) => ({ ...episode, image: backdrop }));
}
