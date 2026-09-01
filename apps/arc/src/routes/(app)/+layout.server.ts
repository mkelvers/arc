import { env } from '$env/dynamic/private';
import { CatalogTaxonomySchema } from '@arc/api-contract/anime';
import { z } from 'zod';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url, request, fetch }) => {
    const canonical = new URL(url.pathname, url.origin).href;
    const taxonomy = await fetch(`${env.API_ORIGIN!}/v1/taxonomy`, {
        headers: {
            Cookie: request.headers.get('cookie') ?? '',
            Authorization: request.headers.get('authorization') ?? '',
        },
    })
        .then(async (response) =>
            response.ok ? CatalogTaxonomySchema.parse(await response.json()) : null
        )
        .catch(() => null);

    if (!locals.user) {
        return { account: null, canonical, genres: taxonomy?.genres ?? [] };
    }

    const unreadNotifications = await fetch(`${env.API_ORIGIN!}/v1/notifications/unread-count`, {
        headers: {
            Cookie: request.headers.get('cookie') ?? '',
            Authorization: request.headers.get('authorization') ?? '',
        },
    })
        .then(async (response) => {
            if (!response.ok) return 0;
            const result = z
                .object({ count: z.number().int().nonnegative() })
                .safeParse(await response.json());
            return result.success ? result.data.count : 0;
        })
        .catch(() => 0);

    return {
        canonical,
        genres: taxonomy?.genres ?? [],
        account: {
            name: locals.user.name,
            username: locals.user.username,
            image: locals.user.image,
            unreadNotifications,
        },
    };
};
