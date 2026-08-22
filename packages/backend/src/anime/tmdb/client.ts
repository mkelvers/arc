import createClient from 'openapi-fetch';

import type { paths } from './generated';

const baseUrl = 'https://api.themoviedb.org';
const imageBaseUrl = 'https://image.tmdb.org/t/p';

function timedFetch(request: Request) {
    return fetch(request, {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]),
    });
}

export function create() {
    if (!process.env.TMDB_READ_ACCESS_TOKEN) {
        throw new TypeError('TMDB_READ_ACCESS_TOKEN is required');
    }

    return createClient<paths>({
        baseUrl,
        headers: {
            Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}`,
        },
        fetch: timedFetch,
    });
}

export function imageUrl(path: string, size = 'original') {
    return `${imageBaseUrl}/${size}${path}`;
}
