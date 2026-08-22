import { getStreams as getAllAnimeStreams } from '../allanime';
import { getEpisodes } from '../allanime/catalog';
import { matchProviderStreamEpisode } from './match';
import type { PlaybackProvider } from './types';

export const allanimeProvider: PlaybackProvider = {
    name: 'AllAnime',
    getEpisodes,
    getStreams: async (anime, episode, modes) => {
        const episodes = await getEpisodes(anime);
        const match = matchProviderStreamEpisode(episodes, episode, anime.episodes);
        if (!match) {
            throw new Error(`AllAnime has no episode matching ${episode.title || episode.id}`);
        }

        return getAllAnimeStreams(anime, match.id, modes);
    },
};
