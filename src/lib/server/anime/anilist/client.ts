import { graphql, type GraphQLRequestError } from '$lib/server/graphql';

const endpoint = 'https://graphql.anilist.co';

export function request<TResult, TVariables>(
  document: Parameters<typeof graphql<TResult, TVariables>>[1],
  variables: TVariables
) {
  return graphql(endpoint, document, variables);
}

export function transientRequestError(cause: GraphQLRequestError) {
  return cause.status == null || cause.status === 429 || cause.status >= 500;
}
