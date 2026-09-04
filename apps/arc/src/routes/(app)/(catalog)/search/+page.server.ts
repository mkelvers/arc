import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

import { SearchResponseSchema } from '@arc/core/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, request, fetch }) => {
    const query = url.searchParams.get('q')?.trim() ?? '';
    if (query.length > 200) {
        error(400, 'Search queries cannot exceed 200 characters');
    }
    if (query.length < 2) {
        return {
            query,
            results: Promise.resolve({
                status: 'success' as const,
                data: [],
            }),
        };
    }
    return {
        query,
        results: fetch(`${env.API_ORIGIN!}/v1/search?q=${encodeURIComponent(query)}`, {
            headers: {
                Cookie: request.headers.get('cookie') ?? '',
                Authorization: request.headers.get('authorization') ?? '',
            },
        })
            .then(async (response) => {
                if (!response.ok) {
                    return {
                        status: 'error' as const,
                    };
                }

                return {
                    status: 'success' as const,
                    data: SearchResponseSchema.parse(await response.json()),
                };
            })
            .catch(() => ({
                status: 'error' as const,
            })),
    };
};
