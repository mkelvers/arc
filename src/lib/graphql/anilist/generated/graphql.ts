/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
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

export type AnimeQueryVariables = Exact<{
  id: number;
}>;


export type AnimeQuery = { Media: { id: number, idMal: number | null, synonyms: Array<string | null> | null, bannerImage: string | null, description: string | null, genres: Array<string | null> | null, format: MediaFormat | null, status: MediaStatus | null, season: MediaSeason | null, seasonYear: number | null, episodes: number | null, duration: number | null, averageScore: number | null, popularity: number | null, favourites: number | null, title: { english: string | null, romaji: string | null, native: string | null } | null, startDate: { year: number | null, month: number | null, day: number | null } | null, endDate: { year: number | null, month: number | null, day: number | null } | null, nextAiringEpisode: { airingAt: number, episode: number } | null, relations: { edges: Array<{ relationType: MediaRelation | null, node: { id: number, type: MediaType | null, title: { english: string | null, romaji: string | null, native: string | null } | null } | null } | null> | null } | null, rankings: Array<{ rank: number, type: MediaRankType, year: number | null, season: MediaSeason | null, allTime: boolean | null } | null> | null, tags: Array<{ name: string, rank: number | null, isGeneralSpoiler: boolean | null, isMediaSpoiler: boolean | null } | null> | null, studios: { nodes: Array<{ name: string } | null> | null } | null, staff: { edges: Array<{ role: string | null, node: { name: { full: string | null } | null } | null } | null> | null } | null } | null };

export type FranchiseMediaQueryVariables = Exact<{
  malIds?: Array<number | null | undefined> | number | null | undefined;
}>;


export type FranchiseMediaQuery = { Page: { media: Array<{ id: number, idMal: number | null, averageScore: number | null, description: string | null, genres: Array<string | null> | null, title: { english: string | null, romaji: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null } | null } | null> | null } | null };

export type HomeAnimeQueryVariables = Exact<{
  season: MediaSeason;
  seasonYear: number;
}>;


export type HomeAnimeQuery = { highlights: { media: Array<{ id: number, bannerImage: string | null, description: string | null, genres: Array<string | null> | null, format: MediaFormat | null, averageScore: number | null, title: { english: string | null, romaji: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null } | null } | null> | null } | null, season: { media: Array<{ id: number, description: string | null, genres: Array<string | null> | null, format: MediaFormat | null, averageScore: number | null, title: { english: string | null, romaji: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null } | null } | null> | null } | null };

export type SearchAnimePageQueryVariables = Exact<{
  search: string;
  page: number;
  perPage: number;
}>;


export type SearchAnimePageQuery = { Page: { pageInfo: { hasNextPage: boolean | null } | null, media: Array<{ id: number, description: string | null, genres: Array<string | null> | null, format: MediaFormat | null, averageScore: number | null, title: { english: string | null, romaji: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null } | null } | null> | null } | null };

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
      averageScore
      description(asHtml: false)
      genres
    }
  }
}
    `) as unknown as TypedDocumentString<FranchiseMediaQuery, FranchiseMediaQueryVariables>;
export const HomeAnimeDocument = new TypedDocumentString(`
    query HomeAnime($season: MediaSeason!, $seasonYear: Int!) {
  highlights: Page(page: 1, perPage: 12) {
    media(
      type: ANIME
      season: $season
      seasonYear: $seasonYear
      status: RELEASING
      sort: [TRENDING_DESC, POPULARITY_DESC]
      isAdult: false
    ) {
      id
      title {
        english
        romaji
        native
      }
      bannerImage
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
}
    `) as unknown as TypedDocumentString<HomeAnimeQuery, HomeAnimeQueryVariables>;
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
}
    `) as unknown as TypedDocumentString<SearchAnimePageQuery, SearchAnimePageQueryVariables>;