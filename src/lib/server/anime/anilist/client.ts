import { graphql } from '$lib/server/graphql';

const endpoint = 'https://graphql.anilist.co';

export function request<TResult, TVariables>(
  document: Parameters<typeof graphql<TResult, TVariables>>[1],
  variables: TVariables,
  options: { retries?: number } = {}
) {
  return graphql(endpoint, document, variables, options);
}
