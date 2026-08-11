import type { AudioMode } from '$lib/anime/audio';
import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';

export type ProviderAnime = NonNullable<AnimeQuery['Media']>;

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
    quality: string | null;
    audioDelay: number;
    subtitleUrl?: string | null;
    provider?: string;
}

export type ProviderStreams = Partial<Record<AudioMode, ProviderStream[]>>;

export interface PlaybackProvider {
    name: string;
    getEpisodes(anime: ProviderAnime): Promise<ProviderEpisode[]>;
    getStreams(
        anime: ProviderAnime,
        episode: ProviderEpisodeReference,
        modes: AudioMode[]
    ): Promise<ProviderStreams>;
}
