import { graphql } from '#graphql';

export const endpoint = 'https://api.mkissa.net/api';
export const site = 'https://mkissa.to';
export const referer = 'https://youtu-chan.com';
export const origin = 'https://mkissa.to';
export const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
export const sourceQueryHash = 'b0a4efecd8df8fce709468d54aaa716b712c93b5b7e351888ddc242898abc38e';
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
