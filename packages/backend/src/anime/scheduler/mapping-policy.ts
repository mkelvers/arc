export const mappingPlaybackProviders = [
    'allanime',
    'anikoto',
    'anineko',
    'animegg',
    'anipub',
    'animepahe',
    'anizone',
] as const;

export type MappingPlaybackProvider = (typeof mappingPlaybackProviders)[number];
