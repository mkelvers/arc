import { env } from '$env/dynamic/private';
import createClient from 'openapi-fetch';

import type { paths } from './generated';

const baseUrl = 'https://api.themoviedb.org';
const imageBaseUrl = 'https://image.tmdb.org/t/p';

export function create() {
    if (!env.TMDB_READ_ACCESS_TOKEN) {
        throw new TypeError('TMDB_READ_ACCESS_TOKEN is required');
    }

    return createClient<paths>({
        baseUrl,
        headers: {
            Authorization: `Bearer ${env.TMDB_READ_ACCESS_TOKEN}`,
        },
    });
}

export function imageUrl(path: string, size = 'original') {
    return `${imageBaseUrl}/${size}${path}`;
}
