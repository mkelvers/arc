import createClient from 'openapi-fetch';

import type { paths } from './generated';

export function create() {
    if (!process.env.TMDB_READ_ACCESS_TOKEN) {
        throw new TypeError('TMDB_READ_ACCESS_TOKEN is required');
    }

    return createClient<paths>({
        baseUrl: 'https://api.themoviedb.org',
        headers: {
            Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}`,
        },
        fetch: (request) =>
            fetch(request, {
                signal: AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]),
            }),
    });
}

export function imageUrl(path: string, size = 'original') {
    return `https://image.tmdb.org/t/p/${size}${path}`;
}
