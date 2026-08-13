import { redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) {
        redirect(303, '/login');
    }

    return {
        anilistConnected: Boolean(
            await db.query.accounts.findFirst({
                columns: { id: true },
                where: and(eq(accounts.userId, locals.user.id), eq(accounts.providerId, 'anilist')),
            })
        ),
    };
};

export const actions: Actions = {
    disconnect: async ({ locals }) => {
        if (!locals.user) {
            redirect(303, '/login');
        }

        await db
            .delete(accounts)
            .where(and(eq(accounts.userId, locals.user.id), eq(accounts.providerId, 'anilist')));

        return { success: true };
    },
};
