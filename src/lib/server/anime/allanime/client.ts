import { graphql } from '$lib/server/graphql';

export const endpoint = 'https://api.mkissa.net/api';
export const site = 'https://allanime.day';
export const referer = 'https://youtu-chan.com';
export const origin = 'https://mkissa.to';
export const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
export const sourceQueryHash = 'f4662f4b7510b26795dd53ef824a0bf1740fbbc5d1273fab18222ac831bca8d0';
export const contentLane = 'k7';

export function request<TResult, TVariables>(
  document: Parameters<typeof graphql<TResult, TVariables>>[1],
  variables: TVariables
) {
  return graphql(endpoint, document, variables, {
    headers: {
      Referer: referer,
      'User-Agent': userAgent,
    },
    timeoutMs: 8_000,
  });
}
