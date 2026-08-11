/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
    | T
    | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
/** The format the media was released in */
export type MediaFormat =
    /** Professionally published manga with more than one chapter */
    | 'MANGA'
    /** Anime movies with a theatrical release */
    | 'MOVIE'
    /** Short anime released as a music video */
    | 'MUSIC'
    /** Written books released as a series of light novels */
    | 'NOVEL'
    /** (Original Net Animation) Anime that have been originally released online or are only available through streaming services. */
    | 'ONA'
    /** Manga with just one chapter */
    | 'ONE_SHOT'
    /** (Original Video Animation) Anime that have been released directly on DVD/Blu-ray without originally going through a theatrical release or television broadcast */
    | 'OVA'
    /** Special episodes that have been included in DVD/Blu-ray releases, picture dramas, pilots, etc */
    | 'SPECIAL'
    /** Anime broadcast on television */
    | 'TV'
    /** Anime which are under 15 minutes in length and broadcast on television */
    | 'TV_SHORT';

/** Media list watching/reading status enum. */
export type MediaListStatus =
    /** Finished watching/reading */
    | 'COMPLETED'
    /** Currently watching/reading */
    | 'CURRENT'
    /** Stopped watching/reading before completing */
    | 'DROPPED'
    /** Paused watching/reading */
    | 'PAUSED'
    /** Planning to watch/read */
    | 'PLANNING'
    /** Re-watching/reading */
    | 'REPEATING';

/** The type of ranking */
export type MediaRankType =
    /** Ranking is based on the media's popularity */
    | 'POPULAR'
    /** Ranking is based on the media's ratings/score */
    | 'RATED';

/** Type of relation media has to its parent. */
export type MediaRelation =
    /** An adaption of this media into a different format */
    | 'ADAPTATION'
    /** An alternative version of the same media */
    | 'ALTERNATIVE'
    /** Shares at least 1 character */
    | 'CHARACTER'
    /** Version 2 only. */
    | 'COMPILATION'
    /** Version 2 only. */
    | 'CONTAINS'
    /** Other */
    | 'OTHER'
    /** The media a side story is from */
    | 'PARENT'
    /** Released before the relation */
    | 'PREQUEL'
    /** Version 3 only. The media is set in the same universe as another media */
    | 'SAME_UNIVERSE'
    /** Released after the relation */
    | 'SEQUEL'
    /** A side story of the parent media */
    | 'SIDE_STORY'
    /** Version 2 only. The source material the media was adapted from */
    | 'SOURCE'
    /** An alternative version of the media with a different primary focus */
    | 'SPIN_OFF'
    /** A shortened and summarized version */
    | 'SUMMARY';

export type MediaSeason =
    /** Predominantly started airing between October and November */
    | 'FALL'
    /** Predominantly started airing between April and June */
    | 'SPRING'
    /** Predominantly started airing between July and September */
    | 'SUMMER'
    /** Predominantly started airing between January and March */
    | 'WINTER';

/** Media sort enums */
export type MediaSort =
    | 'CHAPTERS'
    | 'CHAPTERS_DESC'
    | 'DURATION'
    | 'DURATION_DESC'
    | 'END_DATE'
    | 'END_DATE_DESC'
    | 'EPISODES'
    | 'EPISODES_DESC'
    | 'FAVOURITES'
    | 'FAVOURITES_DESC'
    | 'FORMAT'
    | 'FORMAT_DESC'
    | 'ID'
    | 'ID_DESC'
    | 'POPULARITY'
    | 'POPULARITY_DESC'
    | 'SCORE'
    | 'SCORE_DESC'
    | 'SEARCH_MATCH'
    | 'START_DATE'
    | 'START_DATE_DESC'
    | 'STATUS'
    | 'STATUS_DESC'
    | 'TITLE_ENGLISH'
    | 'TITLE_ENGLISH_DESC'
    | 'TITLE_NATIVE'
    | 'TITLE_NATIVE_DESC'
    | 'TITLE_ROMAJI'
    | 'TITLE_ROMAJI_DESC'
    | 'TRENDING'
    | 'TRENDING_DESC'
    | 'TYPE'
    | 'TYPE_DESC'
    | 'UPDATED_AT'
    | 'UPDATED_AT_DESC'
    | 'VOLUMES'
    | 'VOLUMES_DESC';

/** Source type the media was adapted from */
export type MediaSource =
    /** Version 2+ only. Japanese Anime */
    | 'ANIME'
    /** Version 3 only. Comics excluding manga */
    | 'COMIC'
    /** Version 2+ only. Self-published works */
    | 'DOUJINSHI'
    /** Version 3 only. Games excluding video games */
    | 'GAME'
    /** Written work published in volumes */
    | 'LIGHT_NOVEL'
    /** Version 3 only. Live action media such as movies or TV show */
    | 'LIVE_ACTION'
    /** Asian comic book */
    | 'MANGA'
    /** Version 3 only. Multimedia project */
    | 'MULTIMEDIA_PROJECT'
    /** Version 2+ only. Written works not published in volumes */
    | 'NOVEL'
    /** An original production not based of another work */
    | 'ORIGINAL'
    /** Other */
    | 'OTHER'
    /** Version 3 only. Picture book */
    | 'PICTURE_BOOK'
    /** Video game */
    | 'VIDEO_GAME'
    /** Video game driven primary by text and narrative */
    | 'VISUAL_NOVEL'
    /** Version 3 only. Written works published online */
    | 'WEB_NOVEL';

/** The current releasing status of the media */
export type MediaStatus =
    /** Ended before the work could be finished */
    | 'CANCELLED'
    /** Has completed and is no longer being released */
    | 'FINISHED'
    /** Version 2 only. Is currently paused from releasing and will resume at a later date */
    | 'HIATUS'
    /** To be released at a later date */
    | 'NOT_YET_RELEASED'
    /** Currently releasing */
    | 'RELEASING';

/** Media type enum, anime or manga. */
export type MediaType =
    /** Japanese Anime */
    | 'ANIME'
    /** Asian comic */
    | 'MANGA';

export type AiringAnimePageQueryVariables = Exact<{
    page: number;
    perPage: number;
}>;

export type AiringAnimePageQuery = {
    Page: {
        pageInfo: { hasNextPage: boolean | null } | null;
        media: Array<{
            id: number;
            status: MediaStatus | null;
            nextAiringEpisode: { airingAt: number; episode: number } | null;
        } | null> | null;
    } | null;
};

export type AnimeQueryVariables = Exact<{
    id: number;
}>;

export type AnimeQuery = {
    Media: {
        id: number;
        idMal: number | null;
        synonyms: Array<string | null> | null;
        bannerImage: string | null;
        description: string | null;
        genres: Array<string | null> | null;
        format: MediaFormat | null;
        status: MediaStatus | null;
        season: MediaSeason | null;
        seasonYear: number | null;
        episodes: number | null;
        duration: number | null;
        averageScore: number | null;
        popularity: number | null;
        favourites: number | null;
        title: { english: string | null; romaji: string | null; native: string | null } | null;
        startDate: { year: number | null; month: number | null; day: number | null } | null;
        endDate: { year: number | null; month: number | null; day: number | null } | null;
        nextAiringEpisode: { airingAt: number; episode: number } | null;
        relations: {
            edges: Array<{
                relationType: MediaRelation | null;
                node: {
                    id: number;
                    type: MediaType | null;
                    title: {
                        english: string | null;
                        romaji: string | null;
                        native: string | null;
                    } | null;
                } | null;
            } | null> | null;
        } | null;
        rankings: Array<{
            rank: number;
            type: MediaRankType;
            year: number | null;
            season: MediaSeason | null;
            allTime: boolean | null;
        } | null> | null;
        tags: Array<{
            name: string;
            rank: number | null;
            isGeneralSpoiler: boolean | null;
            isMediaSpoiler: boolean | null;
        } | null> | null;
        studios: { nodes: Array<{ name: string } | null> | null } | null;
        staff: {
            edges: Array<{
                role: string | null;
                node: { name: { full: string | null } | null } | null;
            } | null> | null;
        } | null;
    } | null;
};

export type BrowseAnimeTaxonomyQueryVariables = Exact<{ [key: string]: never }>;

export type BrowseAnimeTaxonomyQuery = {
    GenreCollection: Array<string | null> | null;
    tags: Array<{ name: string; isAdult: boolean | null } | null> | null;
    formats: { enumValues: Array<{ name: string }> | null } | null;
    statuses: { enumValues: Array<{ name: string }> | null } | null;
    sources: { enumValues: Array<{ name: string }> | null } | null;
    seasons: { enumValues: Array<{ name: string }> | null } | null;
};

export type BrowseAnimePageQueryVariables = Exact<{
    search?: string | null | undefined;
    genre?: string | null | undefined;
    tag?: string | null | undefined;
    format?: MediaFormat | null | undefined;
    status?: MediaStatus | null | undefined;
    source?: MediaSource | null | undefined;
    season?: MediaSeason | null | undefined;
    seasonYear?: number | null | undefined;
    countryOfOrigin?: unknown;
    isAdult?: boolean | null | undefined;
    sort?: Array<MediaSort | null | undefined> | MediaSort | null | undefined;
    page: number;
    perPage: number;
}>;

export type BrowseAnimePageQuery = {
    Page: {
        pageInfo: { hasNextPage: boolean | null } | null;
        media: Array<{
            id: number;
            synonyms: Array<string | null> | null;
            description: string | null;
            genres: Array<string | null> | null;
            format: MediaFormat | null;
            status: MediaStatus | null;
            source: MediaSource | null;
            season: MediaSeason | null;
            seasonYear: number | null;
            countryOfOrigin: unknown;
            isAdult: boolean | null;
            averageScore: number | null;
            popularity: number | null;
            title: { english: string | null; romaji: string | null; native: string | null } | null;
            coverImage: { extraLarge: string | null; large: string | null } | null;
            tags: Array<{ name: string } | null> | null;
        } | null> | null;
    } | null;
};

export type FranchiseMediaQueryVariables = Exact<{
    malIds?: Array<number | null | undefined> | number | null | undefined;
}>;

export type FranchiseMediaQuery = {
    Page: {
        media: Array<{
            id: number;
            idMal: number | null;
            format: MediaFormat | null;
            episodes: number | null;
            duration: number | null;
            popularity: number | null;
            averageScore: number | null;
            description: string | null;
            genres: Array<string | null> | null;
            title: { english: string | null; romaji: string | null; native: string | null } | null;
            coverImage: { extraLarge: string | null; large: string | null } | null;
            relations: {
                edges: Array<{
                    relationType: MediaRelation | null;
                    node: { idMal: number | null } | null;
                } | null> | null;
            } | null;
        } | null> | null;
    } | null;
};

export type HomeAnimeQueryVariables = Exact<{
    season: MediaSeason;
    seasonYear: number;
}>;

export type HomeAnimeQuery = {
    season: {
        media: Array<{
            id: number;
            description: string | null;
            genres: Array<string | null> | null;
            format: MediaFormat | null;
            averageScore: number | null;
            title: { english: string | null; romaji: string | null; native: string | null } | null;
            coverImage: { extraLarge: string | null; large: string | null } | null;
        } | null> | null;
    } | null;
    popular: {
        media: Array<{
            id: number;
            description: string | null;
            genres: Array<string | null> | null;
            format: MediaFormat | null;
            averageScore: number | null;
            title: { english: string | null; romaji: string | null; native: string | null } | null;
            coverImage: { extraLarge: string | null; large: string | null } | null;
            relations: {
                edges: Array<{
                    relationType: MediaRelation | null;
                    node: { id: number } | null;
                } | null> | null;
            } | null;
        } | null> | null;
    } | null;
};

export type HomeHeroCandidatesQueryVariables = Exact<{
    seasonYear: number;
}>;

export type HomeHeroCandidatesQuery = {
    Page: {
        media: Array<{
            id: number;
            averageScore: number | null;
            popularity: number | null;
            favourites: number | null;
            seasonYear: number | null;
            genres: Array<string | null> | null;
            relations: {
                edges: Array<{ relationType: MediaRelation | null } | null> | null;
            } | null;
        } | null> | null;
    } | null;
};

export type SearchAnimePageQueryVariables = Exact<{
    search: string;
    page: number;
    perPage: number;
}>;

export type SearchAnimePageQuery = {
    Page: {
        pageInfo: { hasNextPage: boolean | null } | null;
        media: Array<{
            id: number;
            synonyms: Array<string | null> | null;
            description: string | null;
            genres: Array<string | null> | null;
            format: MediaFormat | null;
            averageScore: number | null;
            popularity: number | null;
            title: { english: string | null; romaji: string | null; native: string | null } | null;
            coverImage: { extraLarge: string | null; large: string | null } | null;
            relations: {
                edges: Array<{
                    relationType: MediaRelation | null;
                    node: { id: number } | null;
                } | null> | null;
            } | null;
        } | null> | null;
    } | null;
};

export type SimulcastSeasonStartsQueryVariables = Exact<{ [key: string]: never }>;

export type SimulcastSeasonStartsQuery = {
    winter: { media: Array<{ seasonYear: number | null } | null> | null } | null;
    spring: { media: Array<{ seasonYear: number | null } | null> | null } | null;
    summer: { media: Array<{ seasonYear: number | null } | null> | null } | null;
    fall: { media: Array<{ seasonYear: number | null } | null> | null } | null;
};

export type SyncMediaListQueryVariables = Exact<{
    userId: number;
}>;

export type SyncMediaListQuery = {
    MediaListCollection: {
        lists: Array<{
            entries: Array<{
                id: number;
                status: MediaListStatus | null;
                progress: number | null;
                updatedAt: number | null;
                media: { id: number } | null;
            } | null> | null;
        } | null> | null;
    } | null;
};

export type SaveSyncMediaListEntryMutationVariables = Exact<{
    mediaId: number;
    status?: MediaListStatus | null | undefined;
    progress?: number | null | undefined;
}>;

export type SaveSyncMediaListEntryMutation = { SaveMediaListEntry: { id: number } | null };

export type DeleteSyncMediaListEntryMutationVariables = Exact<{
    id: number;
}>;

export type DeleteSyncMediaListEntryMutation = {
    DeleteMediaListEntry: { deleted: boolean | null } | null;
};

export type FindSyncMediaListEntryQueryVariables = Exact<{
    mediaId: number;
    userId: number;
}>;

export type FindSyncMediaListEntryQuery = { MediaList: { id: number } | null };

export type WatchlistTransferAnimeQueryVariables = Exact<{
    anilistIds?: Array<number | null | undefined> | number | null | undefined;
    malIds?: Array<number | null | undefined> | number | null | undefined;
}>;

export type WatchlistTransferAnimeQuery = {
    anilist: {
        media: Array<{
            id: number;
            idMal: number | null;
            title: { english: string | null; romaji: string | null; native: string | null } | null;
        } | null> | null;
    } | null;
    mal: {
        media: Array<{
            id: number;
            idMal: number | null;
            title: { english: string | null; romaji: string | null; native: string | null } | null;
        } | null> | null;
    } | null;
};

export type WatchlistAnimeQueryVariables = Exact<{
    ids: Array<number> | number;
}>;

export type WatchlistAnimeQuery = {
    Page: {
        media: Array<{
            id: number;
            description: string | null;
            genres: Array<string | null> | null;
            averageScore: number | null;
            title: { english: string | null; romaji: string | null; native: string | null } | null;
            coverImage: { extraLarge: string | null; large: string | null } | null;
        } | null> | null;
    } | null;
};

export class TypedDocumentString<TResult, TVariables>
    extends String
    implements DocumentTypeDecoration<TResult, TVariables>
{
    __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
    private value: string;
    public __meta__?: Record<string, any> | undefined;

    constructor(value: string, __meta__?: Record<string, any> | undefined) {
        super(value);
        this.value = value;
        this.__meta__ = __meta__;
    }

    override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
        return this.value;
    }
}

export const AiringAnimePageDocument = new TypedDocumentString(`
    query AiringAnimePage($page: Int!, $perPage: Int!) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      hasNextPage
    }
    media(type: ANIME, status: RELEASING, sort: ID) {
      id
      status
      nextAiringEpisode {
        airingAt
        episode
      }
    }
  }
}
    `) as unknown as TypedDocumentString<AiringAnimePageQuery, AiringAnimePageQueryVariables>;
export const AnimeDocument = new TypedDocumentString(`
    query Anime($id: Int!) {
  Media(id: $id, type: ANIME) {
    id
    idMal
    title {
      english
      romaji
      native
    }
    synonyms
    bannerImage
    description(asHtml: false)
    genres
    format
    status
    season
    seasonYear
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
    episodes
    duration
    nextAiringEpisode {
      airingAt
      episode
    }
    relations {
      edges {
        relationType
        node {
          id
          type
          title {
            english
            romaji
            native
          }
        }
      }
    }
    averageScore
    popularity
    favourites
    rankings {
      rank
      type
      year
      season
      allTime
    }
    tags {
      name
      rank
      isGeneralSpoiler
      isMediaSpoiler
    }
    studios(isMain: true) {
      nodes {
        name
      }
    }
    staff(page: 1, perPage: 30, sort: RELEVANCE) {
      edges {
        role
        node {
          name {
            full
          }
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<AnimeQuery, AnimeQueryVariables>;
export const BrowseAnimeTaxonomyDocument = new TypedDocumentString(`
    query BrowseAnimeTaxonomy {
  GenreCollection
  tags: MediaTagCollection {
    name
    isAdult
  }
  formats: __type(name: "MediaFormat") {
    enumValues {
      name
    }
  }
  statuses: __type(name: "MediaStatus") {
    enumValues {
      name
    }
  }
  sources: __type(name: "MediaSource") {
    enumValues {
      name
    }
  }
  seasons: __type(name: "MediaSeason") {
    enumValues {
      name
    }
  }
}
    `) as unknown as TypedDocumentString<
    BrowseAnimeTaxonomyQuery,
    BrowseAnimeTaxonomyQueryVariables
>;
export const BrowseAnimePageDocument = new TypedDocumentString(`
    query BrowseAnimePage($search: String, $genre: String, $tag: String, $format: MediaFormat, $status: MediaStatus, $source: MediaSource, $season: MediaSeason, $seasonYear: Int, $countryOfOrigin: CountryCode, $isAdult: Boolean, $sort: [MediaSort], $page: Int!, $perPage: Int!) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      hasNextPage
    }
    media(
      search: $search
      type: ANIME
      genre: $genre
      tag: $tag
      format: $format
      status: $status
      source: $source
      season: $season
      seasonYear: $seasonYear
      countryOfOrigin: $countryOfOrigin
      isAdult: $isAdult
      sort: $sort
    ) {
      id
      title {
        english
        romaji
        native
      }
      synonyms
      coverImage {
        extraLarge
        large
      }
      description(asHtml: false)
      genres
      tags {
        name
      }
      format
      status
      source
      season
      seasonYear
      countryOfOrigin
      isAdult
      averageScore
      popularity
    }
  }
}
    `) as unknown as TypedDocumentString<BrowseAnimePageQuery, BrowseAnimePageQueryVariables>;
export const FranchiseMediaDocument = new TypedDocumentString(`
    query FranchiseMedia($malIds: [Int]) {
  Page(perPage: 50) {
    media(idMal_in: $malIds, type: ANIME) {
      id
      idMal
      title {
        english
        romaji
        native
      }
      coverImage {
        extraLarge
        large
      }
      format
      episodes
      duration
      popularity
      averageScore
      description(asHtml: false)
      genres
      relations {
        edges {
          relationType
          node {
            idMal
          }
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<FranchiseMediaQuery, FranchiseMediaQueryVariables>;
export const HomeAnimeDocument = new TypedDocumentString(`
    query HomeAnime($season: MediaSeason!, $seasonYear: Int!) {
  season: Page(page: 1, perPage: 30) {
    media(
      type: ANIME
      season: $season
      seasonYear: $seasonYear
      status_in: [RELEASING, NOT_YET_RELEASED]
      sort: [POPULARITY_DESC, TRENDING_DESC]
      isAdult: false
    ) {
      id
      title {
        english
        romaji
        native
      }
      coverImage {
        extraLarge
        large
      }
      description(asHtml: false)
      genres
      format
      averageScore
    }
  }
  popular: Page(page: 1, perPage: 50) {
    media(type: ANIME, format: TV, sort: POPULARITY_DESC, isAdult: false) {
      id
      title {
        english
        romaji
        native
      }
      coverImage {
        extraLarge
        large
      }
      description(asHtml: false)
      genres
      format
      averageScore
      relations {
        edges {
          relationType
          node {
            id
          }
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<HomeAnimeQuery, HomeAnimeQueryVariables>;
export const HomeHeroCandidatesDocument = new TypedDocumentString(`
    query HomeHeroCandidates($seasonYear: Int!) {
  Page(page: 1, perPage: 50) {
    media(
      type: ANIME
      format: TV
      status: RELEASING
      seasonYear: $seasonYear
      averageScore_greater: 70
      sort: [TRENDING_DESC, SCORE_DESC]
      isAdult: false
    ) {
      id
      averageScore
      popularity
      favourites
      seasonYear
      genres
      relations {
        edges {
          relationType
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<HomeHeroCandidatesQuery, HomeHeroCandidatesQueryVariables>;
export const SearchAnimePageDocument = new TypedDocumentString(`
    query SearchAnimePage($search: String!, $page: Int!, $perPage: Int!) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      hasNextPage
    }
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      title {
        english
        romaji
        native
      }
      synonyms
      coverImage {
        extraLarge
        large
      }
      description(asHtml: false)
      genres
      format
      averageScore
      popularity
      relations {
        edges {
          relationType
          node {
            id
          }
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<SearchAnimePageQuery, SearchAnimePageQueryVariables>;
export const SimulcastSeasonStartsDocument = new TypedDocumentString(`
    query SimulcastSeasonStarts {
  winter: Page(page: 1, perPage: 1) {
    media(
      type: ANIME
      season: WINTER
      startDate_greater: 10000000
      sort: [START_DATE]
      isAdult: false
    ) {
      seasonYear
    }
  }
  spring: Page(page: 1, perPage: 1) {
    media(
      type: ANIME
      season: SPRING
      startDate_greater: 10000000
      sort: [START_DATE]
      isAdult: false
    ) {
      seasonYear
    }
  }
  summer: Page(page: 1, perPage: 1) {
    media(
      type: ANIME
      season: SUMMER
      startDate_greater: 10000000
      sort: [START_DATE]
      isAdult: false
    ) {
      seasonYear
    }
  }
  fall: Page(page: 1, perPage: 1) {
    media(
      type: ANIME
      season: FALL
      startDate_greater: 10000000
      sort: [START_DATE]
      isAdult: false
    ) {
      seasonYear
    }
  }
}
    `) as unknown as TypedDocumentString<
    SimulcastSeasonStartsQuery,
    SimulcastSeasonStartsQueryVariables
>;
export const SyncMediaListDocument = new TypedDocumentString(`
    query SyncMediaList($userId: Int!) {
  MediaListCollection(userId: $userId, type: ANIME) {
    lists {
      entries {
        id
        status
        progress
        updatedAt
        media {
          id
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<SyncMediaListQuery, SyncMediaListQueryVariables>;
export const SaveSyncMediaListEntryDocument = new TypedDocumentString(`
    mutation SaveSyncMediaListEntry($mediaId: Int!, $status: MediaListStatus, $progress: Int) {
  SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress) {
    id
  }
}
    `) as unknown as TypedDocumentString<
    SaveSyncMediaListEntryMutation,
    SaveSyncMediaListEntryMutationVariables
>;
export const DeleteSyncMediaListEntryDocument = new TypedDocumentString(`
    mutation DeleteSyncMediaListEntry($id: Int!) {
  DeleteMediaListEntry(id: $id) {
    deleted
  }
}
    `) as unknown as TypedDocumentString<
    DeleteSyncMediaListEntryMutation,
    DeleteSyncMediaListEntryMutationVariables
>;
export const FindSyncMediaListEntryDocument = new TypedDocumentString(`
    query FindSyncMediaListEntry($mediaId: Int!, $userId: Int!) {
  MediaList(mediaId: $mediaId, userId: $userId) {
    id
  }
}
    `) as unknown as TypedDocumentString<
    FindSyncMediaListEntryQuery,
    FindSyncMediaListEntryQueryVariables
>;
export const WatchlistTransferAnimeDocument = new TypedDocumentString(`
    query WatchlistTransferAnime($anilistIds: [Int], $malIds: [Int]) {
  anilist: Page(page: 1, perPage: 50) {
    media(id_in: $anilistIds, type: ANIME) {
      id
      idMal
      title {
        english
        romaji
        native
      }
    }
  }
  mal: Page(page: 1, perPage: 50) {
    media(idMal_in: $malIds, type: ANIME) {
      id
      idMal
      title {
        english
        romaji
        native
      }
    }
  }
}
    `) as unknown as TypedDocumentString<
    WatchlistTransferAnimeQuery,
    WatchlistTransferAnimeQueryVariables
>;
export const WatchlistAnimeDocument = new TypedDocumentString(`
    query WatchlistAnime($ids: [Int!]!) {
  Page(page: 1, perPage: 50) {
    media(id_in: $ids, type: ANIME, isAdult: false) {
      id
      title {
        english
        romaji
        native
      }
      coverImage {
        extraLarge
        large
      }
      description(asHtml: false)
      genres
      averageScore
    }
  }
}
    `) as unknown as TypedDocumentString<WatchlistAnimeQuery, WatchlistAnimeQueryVariables>;
