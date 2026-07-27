import type { AudioMode } from '$lib/anime/audio';
import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';
import type { ProviderEpisode } from '../providers/types';

export type AniListAnime = NonNullable<AnimeQuery['Media']>;

export type Episode = ProviderEpisode;

export interface Stream {
    url: string;
    quality: string | null;
    audioDelay: number;
}

export type Streams = Partial<Record<AudioMode, Stream[]>>;

export interface Source {
    name: string;
    url: string;
}

export interface StreamCrypto {
    buildId: string;
    epoch: number;
    key: Buffer;
    refreshAt: number;
}
