import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
    if (!locals.user) {
        return { account: null };
    }

    return {
        account: {
            name: locals.user.name,
            username: locals.user.username,
            image: locals.user.image,
        },
    };
};
