import { env } from '$env/dynamic/private';
import { CatalogTaxonomySchema } from '@arc/api-contract/anime';
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

    return {
        canonical,
        genres: taxonomy?.genres ?? [],
        account: {
            name: locals.user.name,
            username: locals.user.username,
            image: locals.user.image,
        },
    };
};
