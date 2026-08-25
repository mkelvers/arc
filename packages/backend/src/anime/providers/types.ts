import type { AudioMode } from '@arc/shared/audio';
import type { AniListAnime } from '../anilist/types';

export interface ProviderEpisode {
    id: string;
    number: number;
    title: string;
    audio: AudioMode[];
    supplemental?: boolean;
}

export interface ProviderEpisodeReference {
    id: string;
    number: number;
    title?: string;
    release?: Pick<ProviderEpisodeReference, 'number' | 'title'>[];
    relatedReleases?: Pick<ProviderEpisodeReference, 'number' | 'title'>[][];
    specialIndex?: number;
    specialCount?: number;
}

export interface ProviderStream {
    url: string;
    kind?: 'direct' | 'iframe';
    quality: string | null;
    subtitleUrl?: string | null;
    provider?: string;
}

export type ProviderStreams = Partial<Record<AudioMode, ProviderStream[]>>;

export interface PlaybackProvider {
    name: string;
    providesEpisodeInventory?: boolean;
    getEpisodes(anime: AniListAnime): Promise<ProviderEpisode[]>;
    getStreams(
        anime: AniListAnime,
        episode: ProviderEpisodeReference,
        modes: AudioMode[]
    ): Promise<ProviderStreams>;
}
