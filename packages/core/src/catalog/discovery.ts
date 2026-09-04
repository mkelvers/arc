import type { MediaFormat } from '@arc/shared/graphql/generated/graphql';

interface DiscoveryMedia {
    format: MediaFormat | null;
    popularity: number | null;
    duration: number | null;
}

export function isDiscoverableAnime(
    media: DiscoveryMedia,
    formats: readonly MediaFormat[] = ['TV', 'ONA']
) {
    return (
        media.format !== null &&
        formats.includes(media.format) &&
        media.popularity !== null &&
        media.popularity >= 2_000 &&
        (media.duration === null || media.duration >= 15)
    );
}
