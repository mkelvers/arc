import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';

export type AniListAnime = NonNullable<AnimeQuery['Media']>;

export interface Mapping {
    id: number;
    mediaType: 'movie' | 'tv';
}

export interface Candidate extends Mapping {
    date: string | null;
    name: string;
    originalName: string;
    popularity: number;
}

export interface StoredMapping extends Mapping {
    animeId: number;
    externalIdId: number;
    title: string | null;
    verifiedAt: Date | null;
}

export interface ArtworkImage {
    aspectRatio: number;
    filePath: string;
    height: number;
    language: string | null;
    url: string;
    voteAverage: number;
    width: number;
}

export interface Artwork extends Mapping {
    backdrops: ArtworkImage[];
    logos: ArtworkImage[];
    selectedBackdrop: ArtworkImage | null;
    selectedLogo: ArtworkImage | null;
    selectedPoster: ArtworkImage | null;
    logoHidden: boolean;
    logoSize: number;
}

export interface EpisodeMetadata {
    title: string;
    titleSource?: EpisodeTextSource | null;
    overview: string;
    overviewSource?: EpisodeTextSource | null;
    imageUrl: string | null;
    runtime: number | null;
    airDate: string;
    rawAirDate?: string;
}

export type EpisodeTextSource = 'tmdb' | 'machine';

export interface StoredEpisodeText {
    title: string | null;
    titleSource: EpisodeTextSource | null;
    overview: string | null;
    overviewSource: EpisodeTextSource | null;
}

export interface EpisodeCandidate extends EpisodeMetadata {
    episodeNumber: number;
    releaseEpisodeNumber?: number;
    seasonNumber: number;
    rawAirDate: string;
}
