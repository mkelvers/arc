/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type SearchInput = {
  allowAdult?: boolean | null | undefined;
  allowUnknown?: boolean | null | undefined;
  includeTypes?: boolean | null | undefined;
  query?: string | null | undefined;
  season?: string | null | undefined;
  types?: Array<string> | null | undefined;
  year?: number | null | undefined;
};

export type VaildTranslationTypeEnumType = 'dub' | 'raw' | 'sub';

export type AllAnimeSearchQueryVariables = Exact<{
  search?: SearchInput | null | undefined;
  translationType?: VaildTranslationTypeEnumType | null | undefined;
}>;

export type AllAnimeSearchQuery = {
  shows: {
    edges: Array<{ _id: string | null; malId: string | null; name: string | null }> | null;
  } | null;
};

export type AllAnimeAvailableEpisodesQueryVariables = Exact<{
  showId: string;
  start: number;
  end: number;
}>;

export type AllAnimeAvailableEpisodesQuery = {
  show: { availableEpisodesDetail: unknown } | null;
  episodeInfos: Array<{ episodeIdNum: number | string | null; notes: string | null }> | null;
};

export type AllAnimeWeeklyPopularQueryVariables = Exact<{ [key: string]: never }>;

export type AllAnimeWeeklyPopularQuery = {
  queryPopular: {
    recommendations: Array<{
      anyCard: {
        aniListId: number | string | null;
        availableEpisodesDetail: unknown;
        siteRanks: { weekly: { position: number | null } | null } | null;
      } | null;
    }> | null;
  } | null;
};

export type AllAnimeSimulcastPageQueryVariables = Exact<{
  search?: SearchInput | null | undefined;
  page: number;
  limit: number;
}>;

export type AllAnimeSimulcastPageQuery = {
  shows: {
    edges: Array<{
      _id: string | null;
      aniListId: number | string | null;
      name: string | null;
      englishName: string | null;
      description: string | null;
      thumbnail: string | null;
      averageScore: number | null;
      genres: Array<string> | null;
      season: unknown;
      availableEpisodesDetail: unknown;
    }> | null;
  } | null;
};

export type AllAnimeEpisodeSourcesQueryVariables = Exact<{
  showId: string;
  translationType: VaildTranslationTypeEnumType;
  episodeString: string;
}>;

export type AllAnimeEpisodeSourcesQuery = { episode: { sourceUrls: unknown } | null };

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

export const AllAnimeSearchDocument = new TypedDocumentString(`
    query AllAnimeSearch($search: SearchInput, $translationType: VaildTranslationTypeEnumType) {
  shows(
    search: $search
    limit: 40
    page: 1
    translationType: $translationType
    countryOrigin: ALL
  ) {
    edges {
      _id
      malId
      name
    }
  }
}
    `) as unknown as TypedDocumentString<AllAnimeSearchQuery, AllAnimeSearchQueryVariables>;
export const AllAnimeAvailableEpisodesDocument = new TypedDocumentString(`
    query AllAnimeAvailableEpisodes($showId: String!, $start: Float!, $end: Float!) {
  show(_id: $showId) {
    availableEpisodesDetail
  }
  episodeInfos(showId: $showId, episodeNumStart: $start, episodeNumEnd: $end) {
    episodeIdNum
    notes
  }
}
    `) as unknown as TypedDocumentString<
  AllAnimeAvailableEpisodesQuery,
  AllAnimeAvailableEpisodesQueryVariables
>;
export const AllAnimeWeeklyPopularDocument = new TypedDocumentString(`
    query AllAnimeWeeklyPopular {
  queryPopular(
    type: anime
    size: 100
    dateRange: 7
    page: 1
    allowAdult: false
    allowUnknown: false
    denyEcchi: true
  ) {
    recommendations {
      anyCard {
        aniListId
        availableEpisodesDetail
        siteRanks {
          weekly {
            position
          }
        }
      }
    }
  }
}
    `) as unknown as TypedDocumentString<
  AllAnimeWeeklyPopularQuery,
  AllAnimeWeeklyPopularQueryVariables
>;
export const AllAnimeSimulcastPageDocument = new TypedDocumentString(`
    query AllAnimeSimulcastPage($search: SearchInput, $page: Int!, $limit: Int!) {
  shows(search: $search, limit: $limit, page: $page, countryOrigin: ALL) {
    edges {
      _id
      aniListId
      name
      englishName
      description
      thumbnail
      averageScore
      genres
      season
      availableEpisodesDetail
    }
  }
}
    `) as unknown as TypedDocumentString<
  AllAnimeSimulcastPageQuery,
  AllAnimeSimulcastPageQueryVariables
>;
export const AllAnimeEpisodeSourcesDocument = new TypedDocumentString(`
    query AllAnimeEpisodeSources($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) {
  episode(
    showId: $showId
    translationType: $translationType
    episodeString: $episodeString
  ) {
    sourceUrls
  }
}
    `) as unknown as TypedDocumentString<
  AllAnimeEpisodeSourcesQuery,
  AllAnimeEpisodeSourcesQueryVariables
>;
