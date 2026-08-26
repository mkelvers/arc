import type { MediaFormat } from '@arc/shared/anilist/generated/graphql';

export const discoveryCatalogRevision = 2;
export const discoveryFormats = ['TV', 'ONA'] as const satisfies readonly MediaFormat[];
export const discoveryMinimumPopularity = 2_000;
export const discoveryMinimumDuration = 15;

interface DiscoveryMedia {
    format: MediaFormat | null;
    popularity: number | null;
    duration: number | null;
}

export function isDiscoverableAnime(
    media: DiscoveryMedia,
    formats: readonly MediaFormat[] = discoveryFormats
) {
    return (
        media.format !== null &&
        formats.includes(media.format) &&
        media.popularity !== null &&
        media.popularity >= discoveryMinimumPopularity &&
        (media.duration === null || media.duration >= discoveryMinimumDuration)
    );
}
