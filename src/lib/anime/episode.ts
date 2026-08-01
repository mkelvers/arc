import type { AnimeEpisode } from './types';

export function episodeHeading(episode: Pick<AnimeEpisode, 'label' | 'title'>) {
    return episode.title
        ? `${episode.label} – ${episode.title}`
        : episode.label;
}
