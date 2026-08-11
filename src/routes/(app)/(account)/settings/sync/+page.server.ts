import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';

import { db } from '$lib/server/db';
import { syncSettings } from '$lib/server/db/schema';
import { enqueueUserSync } from '$lib/server/sync/queue';
import type { Actions, PageServerLoad } from './$types';

const settingSchema = z.enum([
    'automaticSync',
    'episodeProgress',
    'watchingStatus',
    'importAnilistChanges',
]);
export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) {
        redirect(303, '/login');
    }

    const userId = locals.user.id;
    const settings = await db.query.syncSettings.findFirst({
        where: (setting, { eq }) => eq(setting.userId, userId),
    });
    const anilistAccount = await db.query.accounts.findFirst({
        columns: { id: true },
        where: (account, { and, eq }) =>
            and(eq(account.userId, userId), eq(account.providerId, 'anilist')),
    });

    return {
        anilistConnected: Boolean(anilistAccount),
        settings: settings ?? {
            automaticSync: false,
            episodeProgress: false,
            watchingStatus: false,
            importAnilistChanges: false,
            lastSyncedAt: null,
        },
    };
};

export const actions: Actions = {
    update: async ({ locals, request }) => {
        if (!locals.user) {
            redirect(303, '/login');
        }

        const form = await request.formData();
        const setting = settingSchema.safeParse(form.get('setting'));
        const enabled = form.get('enabled') === 'true';

        if (!setting.success) {
            return fail(400, { message: 'Invalid sync setting.' });
        }

        const values = {
            userId: locals.user.id,
            [setting.data]: enabled,
            updatedAt: new Date(),
        };

        await db
            .insert(syncSettings)
            .values(values)
            .onConflictDoUpdate({ target: syncSettings.userId, set: values });

        return { success: true };
    },
    sync: async ({ locals }) => {
        if (!locals.user) {
            redirect(303, '/login');
        }

        const userId = locals.user.id;
        const settings = await db.query.syncSettings.findFirst({
            where: (entry, { eq }) => eq(entry.userId, userId),
        });
        if (
            !settings ||
            (!settings.importAnilistChanges &&
                !settings.watchingStatus &&
                !settings.episodeProgress)
        ) {
            return fail(400, { message: 'Choose at least one sync option before syncing.' });
        }
        try {
            await enqueueUserSync(userId);
        } catch {
            return fail(503, { message: 'Background sync is not configured.' });
        }
        return { success: true, message: 'Sync queued.' };
    },
};
