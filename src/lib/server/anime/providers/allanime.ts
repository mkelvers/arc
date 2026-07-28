import { allanime } from '../allanime';
import { matchProviderEpisode } from './match';
import type { PlaybackProvider } from './types';

export const allanimeProvider: PlaybackProvider = {
    name: 'AllAnime',
    getEpisodes: (anime) => allanime.getEpisodes(anime),
    getStreams: async (anime, episode, modes) => {
        const episodes = await allanime.getEpisodes(anime);
        const match = matchProviderEpisode(episodes, episode);
        if (!match) {
            throw new Error(
                `AllAnime has no episode matching ${episode.title || episode.id}`,
            );
        }

        return allanime.getStreams(anime, match.id, modes);
    },
};
