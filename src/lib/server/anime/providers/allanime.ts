import { allanime } from '../allanime';
import type { PlaybackProvider } from './types';

export const allanimeProvider: PlaybackProvider = {
    name: 'AllAnime',
    getEpisodes: (anime) => allanime.getEpisodes(anime),
    getStreams: (anime, episode, modes) =>
        allanime.getStreams(anime, episode.id, modes),
};
