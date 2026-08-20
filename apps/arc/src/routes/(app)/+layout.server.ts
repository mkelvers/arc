import { eq } from 'drizzle-orm';

import { db } from '@arc/db';
import { users } from '@arc/db/schema';
import type { LayoutServerLoad } from './$types';

async function getAccount(userId: string) {
    const [account] = await db
        .select({
            name: users.name,
            username: users.username,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (!account) {
        throw new Error(`Account ${userId} does not exist`);
    }

    return account;
}

export const load: LayoutServerLoad = async ({ locals }) => {
    if (!locals.user) {
        return { account: null };
    }

    return { account: await getAccount(locals.user.id) };
};
