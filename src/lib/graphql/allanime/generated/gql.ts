/* eslint-disable */
import * as types from './graphql';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "query AllAnimeSearch($search: SearchInput, $translationType: VaildTranslationTypeEnumType) {\n  shows(\n    search: $search\n    limit: 40\n    page: 1\n    translationType: $translationType\n    countryOrigin: ALL\n  ) {\n    edges {\n      _id\n      malId\n      name\n    }\n  }\n}\n\nquery AllAnimeAvailableEpisodes($showId: String!, $start: Float!, $end: Float!) {\n  show(_id: $showId) {\n    availableEpisodesDetail\n  }\n  episodeInfos(showId: $showId, episodeNumStart: $start, episodeNumEnd: $end) {\n    episodeIdNum\n    notes\n  }\n}\n\nquery AllAnimeWeeklyPopular {\n  queryPopular(\n    type: anime\n    size: 100\n    dateRange: 7\n    page: 1\n    allowAdult: false\n    allowUnknown: false\n    denyEcchi: true\n  ) {\n    recommendations {\n      anyCard {\n        aniListId\n        availableEpisodesDetail\n        siteRanks {\n          weekly {\n            position\n          }\n        }\n      }\n    }\n  }\n}\n\nquery AllAnimeEpisodeSources($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) {\n  episode(\n    showId: $showId\n    translationType: $translationType\n    episodeString: $episodeString\n  ) {\n    sourceUrls\n  }\n}": typeof types.AllAnimeSearchDocument,
};
const documents: Documents = {
    "query AllAnimeSearch($search: SearchInput, $translationType: VaildTranslationTypeEnumType) {\n  shows(\n    search: $search\n    limit: 40\n    page: 1\n    translationType: $translationType\n    countryOrigin: ALL\n  ) {\n    edges {\n      _id\n      malId\n      name\n    }\n  }\n}\n\nquery AllAnimeAvailableEpisodes($showId: String!, $start: Float!, $end: Float!) {\n  show(_id: $showId) {\n    availableEpisodesDetail\n  }\n  episodeInfos(showId: $showId, episodeNumStart: $start, episodeNumEnd: $end) {\n    episodeIdNum\n    notes\n  }\n}\n\nquery AllAnimeWeeklyPopular {\n  queryPopular(\n    type: anime\n    size: 100\n    dateRange: 7\n    page: 1\n    allowAdult: false\n    allowUnknown: false\n    denyEcchi: true\n  ) {\n    recommendations {\n      anyCard {\n        aniListId\n        availableEpisodesDetail\n        siteRanks {\n          weekly {\n            position\n          }\n        }\n      }\n    }\n  }\n}\n\nquery AllAnimeEpisodeSources($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) {\n  episode(\n    showId: $showId\n    translationType: $translationType\n    episodeString: $episodeString\n  ) {\n    sourceUrls\n  }\n}": types.AllAnimeSearchDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query AllAnimeSearch($search: SearchInput, $translationType: VaildTranslationTypeEnumType) {\n  shows(\n    search: $search\n    limit: 40\n    page: 1\n    translationType: $translationType\n    countryOrigin: ALL\n  ) {\n    edges {\n      _id\n      malId\n      name\n    }\n  }\n}\n\nquery AllAnimeAvailableEpisodes($showId: String!, $start: Float!, $end: Float!) {\n  show(_id: $showId) {\n    availableEpisodesDetail\n  }\n  episodeInfos(showId: $showId, episodeNumStart: $start, episodeNumEnd: $end) {\n    episodeIdNum\n    notes\n  }\n}\n\nquery AllAnimeWeeklyPopular {\n  queryPopular(\n    type: anime\n    size: 100\n    dateRange: 7\n    page: 1\n    allowAdult: false\n    allowUnknown: false\n    denyEcchi: true\n  ) {\n    recommendations {\n      anyCard {\n        aniListId\n        availableEpisodesDetail\n        siteRanks {\n          weekly {\n            position\n          }\n        }\n      }\n    }\n  }\n}\n\nquery AllAnimeEpisodeSources($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) {\n  episode(\n    showId: $showId\n    translationType: $translationType\n    episodeString: $episodeString\n  ) {\n    sourceUrls\n  }\n}"): typeof import('./graphql').AllAnimeSearchDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
