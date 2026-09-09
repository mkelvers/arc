import type { AniListAnime, AnimeMetadataField } from './anilist-types';

export interface AnimeReleaseSnapshot {
    provider: string;
    data: AniListAnime;
    sourceFetchedAt: Date;
}

type MetadataFieldSources = Partial<Record<AnimeMetadataField, string>>;

function valueOr<T>(primary: T | null | undefined, fallback: T | null | undefined) {
    return primary ?? fallback ?? null;
}

function listOr<T>(primary: T[] | null | undefined, fallback: T[] | null | undefined) {
    return primary?.length ? primary : (fallback ?? null);
}

function titleOr(
    primary: AniListAnime['title'],
    fallback: AniListAnime['title']
): AniListAnime['title'] {
    if (!primary && !fallback) return null;
    return {
        english: valueOr(primary?.english, fallback?.english),
        romaji: valueOr(primary?.romaji, fallback?.romaji),
        native: valueOr(primary?.native, fallback?.native),
    };
}

function coverImageOr(
    primary: AniListAnime['coverImage'],
    fallback: AniListAnime['coverImage']
): AniListAnime['coverImage'] {
    if (!primary && !fallback) return null;
    return {
        extraLarge: valueOr(primary?.extraLarge, fallback?.extraLarge),
        large: valueOr(primary?.large, fallback?.large),
    };
}

function relationsOr(
    primary: AniListAnime['relations'],
    fallback: AniListAnime['relations']
): AniListAnime['relations'] {
    const edges = listOr(primary?.edges, fallback?.edges);
    return primary || fallback ? { edges } : null;
}

function studiosOr(
    primary: AniListAnime['studios'],
    fallback: AniListAnime['studios']
): AniListAnime['studios'] {
    const nodes = listOr(primary?.nodes, fallback?.nodes);
    return primary || fallback ? { nodes } : null;
}

function staffOr(
    primary: AniListAnime['staff'],
    fallback: AniListAnime['staff']
): AniListAnime['staff'] {
    const edges = listOr(primary?.edges, fallback?.edges);
    return primary || fallback ? { edges } : null;
}

function providerOrder(left: AnimeReleaseSnapshot, right: AnimeReleaseSnapshot) {
    if (left.provider === 'anilist') return -1;
    if (right.provider === 'anilist') return 1;
    return right.sourceFetchedAt.getTime() - left.sourceFetchedAt.getTime();
}

function mergePair(
    primary: AniListAnime,
    fallback: AniListAnime,
    fallbackProvider: string,
    fieldSources: MetadataFieldSources
) {
    const merged: AniListAnime = {
        ...primary,
        idMal: valueOr(primary.idMal, fallback.idMal),
        title: titleOr(primary.title, fallback.title),
        synonyms: listOr(primary.synonyms, fallback.synonyms),
        coverImage: coverImageOr(primary.coverImage, fallback.coverImage),
        bannerImage: valueOr(primary.bannerImage, fallback.bannerImage),
        description: valueOr(primary.description, fallback.description),
        genres: listOr(primary.genres, fallback.genres),
        format: valueOr(primary.format, fallback.format),
        status: valueOr(primary.status, fallback.status),
        season: valueOr(primary.season, fallback.season),
        seasonYear: valueOr(primary.seasonYear, fallback.seasonYear),
        startDate: valueOr(primary.startDate, fallback.startDate),
        endDate: valueOr(primary.endDate, fallback.endDate),
        episodes: valueOr(primary.episodes, fallback.episodes),
        duration: valueOr(primary.duration, fallback.duration),
        // Airing timestamps are AniList-authoritative and are never invented by a fallback.
        nextAiringEpisode: primary.nextAiringEpisode,
        relations: relationsOr(primary.relations, fallback.relations),
        averageScore: valueOr(primary.averageScore, fallback.averageScore),
        popularity: valueOr(primary.popularity, fallback.popularity),
        favourites: valueOr(primary.favourites, fallback.favourites),
        rankings: listOr(primary.rankings, fallback.rankings),
        tags: listOr(primary.tags, fallback.tags),
        studios: studiosOr(primary.studios, fallback.studios),
        staff: staffOr(primary.staff, fallback.staff),
        isAdult: primary.isAdult ?? fallback.isAdult,
        source: valueOr(primary.source, fallback.source),
        countryOfOrigin: valueOr(primary.countryOfOrigin, fallback.countryOfOrigin),
    };

    if (primary.idMal == null && fallback.idMal != null) fieldSources.idMal ??= fallbackProvider;
    if (!primary.title && fallback.title) fieldSources.title ??= fallbackProvider;
    if (!primary.synonyms?.length && fallback.synonyms?.length)
        fieldSources.synonyms ??= fallbackProvider;
    if (!primary.coverImage && fallback.coverImage) fieldSources.coverImage ??= fallbackProvider;
    if (!primary.bannerImage && fallback.bannerImage) fieldSources.bannerImage ??= fallbackProvider;
    if (!primary.description && fallback.description) fieldSources.description ??= fallbackProvider;
    if (!primary.genres?.length && fallback.genres?.length)
        fieldSources.genres ??= fallbackProvider;
    if (!primary.format && fallback.format) fieldSources.format ??= fallbackProvider;
    if (!primary.status && fallback.status) fieldSources.status ??= fallbackProvider;
    if (!primary.season && fallback.season) fieldSources.season ??= fallbackProvider;
    if (primary.seasonYear == null && fallback.seasonYear != null)
        fieldSources.seasonYear ??= fallbackProvider;
    if (!primary.startDate && fallback.startDate) fieldSources.startDate ??= fallbackProvider;
    if (!primary.endDate && fallback.endDate) fieldSources.endDate ??= fallbackProvider;
    if (primary.episodes == null && fallback.episodes != null)
        fieldSources.episodes ??= fallbackProvider;
    if (primary.duration == null && fallback.duration != null)
        fieldSources.duration ??= fallbackProvider;
    if (
        primary.relations?.edges?.length !== undefined &&
        !primary.relations.edges.length &&
        fallback.relations?.edges?.length
    )
        fieldSources.relations ??= fallbackProvider;
    if (primary.averageScore == null && fallback.averageScore != null)
        fieldSources.averageScore ??= fallbackProvider;
    if (primary.popularity == null && fallback.popularity != null)
        fieldSources.popularity ??= fallbackProvider;
    if (primary.favourites == null && fallback.favourites != null)
        fieldSources.favourites ??= fallbackProvider;
    if (!primary.rankings?.length && fallback.rankings?.length)
        fieldSources.rankings ??= fallbackProvider;
    if (!primary.tags?.length && fallback.tags?.length) fieldSources.tags ??= fallbackProvider;
    if (!primary.studios?.nodes?.length && fallback.studios?.nodes?.length)
        fieldSources.studios ??= fallbackProvider;
    if (!primary.staff?.edges?.length && fallback.staff?.edges?.length)
        fieldSources.staff ??= fallbackProvider;
    if (primary.source == null && fallback.source != null) fieldSources.source ??= fallbackProvider;
    if (primary.countryOfOrigin == null && fallback.countryOfOrigin != null)
        fieldSources.countryOfOrigin ??= fallbackProvider;

    return merged;
}

export function mergeAnimeReleaseSnapshots(snapshots: AnimeReleaseSnapshot[]) {
    const ordered = [...snapshots].sort(providerOrder);
    const [authoritative, ...fallbacks] = ordered;
    if (!authoritative) return null;

    const fieldSources = {
        ...authoritative.data.metadataFieldSources,
    } satisfies MetadataFieldSources;
    let merged = authoritative.data;
    for (const fallback of fallbacks) {
        merged = mergePair(merged, fallback.data, fallback.provider, fieldSources);
    }

    if (authoritative.provider === 'anilist') {
        delete merged.metadataSource;
        delete merged.metadataSourceId;
    } else {
        merged.metadataSource = authoritative.provider;
    }

    if (Object.keys(fieldSources).length) {
        merged.metadataFieldSources = fieldSources;
    } else {
        delete merged.metadataFieldSources;
    }

    return merged;
}

export function relationSnapshotProvider(snapshots: AnimeReleaseSnapshot[]) {
    const ordered = [...snapshots].sort(providerOrder);
    return ordered.find(({ data }) => (data.relations?.edges?.length ?? 0) > 0)?.provider ?? null;
}
