import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
    const canonical = new URL(url.pathname, url.origin).href;

    if (!locals.user) {
        return { account: null, canonical };
    }

    return {
        canonical,
        account: {
            name: locals.user.name,
            username: locals.user.username,
            image: locals.user.image,
        },
    };
};
