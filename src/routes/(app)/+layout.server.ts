import { getAccount } from '$lib/server/account';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
    if (!locals.user) {
        return { account: null };
    }

    const account = await getAccount(locals.user.id);

    return { account };
};
