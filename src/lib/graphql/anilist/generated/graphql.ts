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

export type MediaSeason =
  /** Predominantly started airing between October and November */
  | 'FALL'
  /** Predominantly started airing between April and June */
  | 'SPRING'
  /** Predominantly started airing between July and September */
  | 'SUMMER'
  /** Predominantly started airing between January and March */
  | 'WINTER';

export type AnimeQueryVariables = Exact<{
  id: number;
}>;


export type AnimeQuery = { Media: { id: number, synonyms: Array<string | null> | null, description: string | null, genres: Array<string | null> | null, format: MediaFormat | null, season: MediaSeason | null, seasonYear: number | null, averageScore: number | null, popularity: number | null, favourites: number | null, title: { english: string | null, romaji: string | null, native: string | null } | null, startDate: { year: number | null } | null, rankings: Array<{ rank: number, type: MediaRankType, year: number | null, season: MediaSeason | null, allTime: boolean | null } | null> | null, tags: Array<{ name: string, rank: number | null, isGeneralSpoiler: boolean | null, isMediaSpoiler: boolean | null } | null> | null, studios: { nodes: Array<{ name: string } | null> | null } | null, staff: { edges: Array<{ role: string | null, node: { name: { full: string | null } | null } | null } | null> | null } | null } | null };

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
    title {
      english
      romaji
      native
    }
    synonyms
    description(asHtml: false)
    genres
    format
    season
    seasonYear
    startDate {
      year
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