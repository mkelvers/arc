import type { AudioMode } from '$lib/anime/audio';
import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';

export type AniListAnime = NonNullable<AnimeQuery['Media']>;

export interface Episode {
    id: string;
    number: number;
    title: string;
    audio: AudioMode[];
}

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
