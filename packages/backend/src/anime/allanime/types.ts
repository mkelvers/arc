import type { AudioMode } from '@arc/shared/audio';

export interface Stream {
    url: string;
    quality: string | null;
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
