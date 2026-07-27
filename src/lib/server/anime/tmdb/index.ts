import { getArtwork } from './artwork';
import { getEpisodeMetadata } from './episodes';
import { resolve } from './mapping';
import {
    getStoredMedia,
    refreshArtwork,
    selectArtwork,
    setLogoSize,
} from './media';

export const tmdb = {
    getArtwork,
    getEpisodeMetadata,
    getStoredMedia,
    refreshArtwork,
    resolve,
    selectArtwork,
    setLogoSize,
};
