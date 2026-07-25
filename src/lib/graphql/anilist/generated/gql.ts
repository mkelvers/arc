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
    "query Anime($id: Int!) {\n  Media(id: $id, type: ANIME) {\n    id\n    idMal\n    title {\n      english\n      romaji\n      native\n    }\n    synonyms\n    bannerImage\n    description(asHtml: false)\n    genres\n    format\n    season\n    seasonYear\n    startDate {\n      year\n      month\n      day\n    }\n    episodes\n    duration\n    relations {\n      edges {\n        relationType\n        node {\n          id\n          type\n          title {\n            english\n            romaji\n            native\n          }\n        }\n      }\n    }\n    averageScore\n    popularity\n    favourites\n    rankings {\n      rank\n      type\n      year\n      season\n      allTime\n    }\n    tags {\n      name\n      rank\n      isGeneralSpoiler\n      isMediaSpoiler\n    }\n    studios(isMain: true) {\n      nodes {\n        name\n      }\n    }\n    staff(page: 1, perPage: 30, sort: RELEVANCE) {\n      edges {\n        role\n        node {\n          name {\n            full\n          }\n        }\n      }\n    }\n  }\n}": typeof types.AnimeDocument,
    "query FranchiseMedia($malIds: [Int]) {\n  Page(perPage: 50) {\n    media(idMal_in: $malIds, type: ANIME) {\n      id\n      idMal\n      title {\n        english\n        romaji\n        native\n      }\n      coverImage {\n        extraLarge\n        large\n      }\n    }\n  }\n}": typeof types.FranchiseMediaDocument,
};
const documents: Documents = {
    "query Anime($id: Int!) {\n  Media(id: $id, type: ANIME) {\n    id\n    idMal\n    title {\n      english\n      romaji\n      native\n    }\n    synonyms\n    bannerImage\n    description(asHtml: false)\n    genres\n    format\n    season\n    seasonYear\n    startDate {\n      year\n      month\n      day\n    }\n    episodes\n    duration\n    relations {\n      edges {\n        relationType\n        node {\n          id\n          type\n          title {\n            english\n            romaji\n            native\n          }\n        }\n      }\n    }\n    averageScore\n    popularity\n    favourites\n    rankings {\n      rank\n      type\n      year\n      season\n      allTime\n    }\n    tags {\n      name\n      rank\n      isGeneralSpoiler\n      isMediaSpoiler\n    }\n    studios(isMain: true) {\n      nodes {\n        name\n      }\n    }\n    staff(page: 1, perPage: 30, sort: RELEVANCE) {\n      edges {\n        role\n        node {\n          name {\n            full\n          }\n        }\n      }\n    }\n  }\n}": types.AnimeDocument,
    "query FranchiseMedia($malIds: [Int]) {\n  Page(perPage: 50) {\n    media(idMal_in: $malIds, type: ANIME) {\n      id\n      idMal\n      title {\n        english\n        romaji\n        native\n      }\n      coverImage {\n        extraLarge\n        large\n      }\n    }\n  }\n}": types.FranchiseMediaDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query Anime($id: Int!) {\n  Media(id: $id, type: ANIME) {\n    id\n    idMal\n    title {\n      english\n      romaji\n      native\n    }\n    synonyms\n    bannerImage\n    description(asHtml: false)\n    genres\n    format\n    season\n    seasonYear\n    startDate {\n      year\n      month\n      day\n    }\n    episodes\n    duration\n    relations {\n      edges {\n        relationType\n        node {\n          id\n          type\n          title {\n            english\n            romaji\n            native\n          }\n        }\n      }\n    }\n    averageScore\n    popularity\n    favourites\n    rankings {\n      rank\n      type\n      year\n      season\n      allTime\n    }\n    tags {\n      name\n      rank\n      isGeneralSpoiler\n      isMediaSpoiler\n    }\n    studios(isMain: true) {\n      nodes {\n        name\n      }\n    }\n    staff(page: 1, perPage: 30, sort: RELEVANCE) {\n      edges {\n        role\n        node {\n          name {\n            full\n          }\n        }\n      }\n    }\n  }\n}"): typeof import('./graphql').AnimeDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query FranchiseMedia($malIds: [Int]) {\n  Page(perPage: 50) {\n    media(idMal_in: $malIds, type: ANIME) {\n      id\n      idMal\n      title {\n        english\n        romaji\n        native\n      }\n      coverImage {\n        extraLarge\n        large\n      }\n    }\n  }\n}"): typeof import('./graphql').FranchiseMediaDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
