import type { MediaFormat } from '@arc/shared/anilist/generated/graphql';

export const discoveryCatalogRevision = 1;
export const discoveryFormats = ['TV', 'ONA'] as const satisfies readonly MediaFormat[];
export const discoveryMinimumPopularity = 2_000;
export const discoveryMinimumDuration = 15;

interface DiscoveryMedia {
    format: MediaFormat | null;
    popularity: number | null;
    duration: number | null;
}

export function isDiscoverableAnime(media: DiscoveryMedia) {
    return (
        media.format !== null &&
        discoveryFormats.includes(media.format as (typeof discoveryFormats)[number]) &&
        media.popularity !== null &&
        media.popularity >= discoveryMinimumPopularity &&
        (media.duration === null || media.duration >= discoveryMinimumDuration)
    );
}
