import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '$lib/server/db';
import { accounts, syncSettings } from '$lib/server/db/schema';
import { applyWatchlistEntries } from '$lib/server/watchlist';
import type { Actions, PageServerLoad } from './$types';

const settingSchema = z.enum([
  'automaticSync',
  'episodeProgress',
  'watchingStatus',
  'importAnilistChanges',
]);
const syncResponseSchema = z.object({
  data: z.object({
    MediaListCollection: z.object({
      lists: z.array(
        z.object({
          entries: z.array(
            z.object({
              status: z.enum(['CURRENT', 'COMPLETED', 'PLANNING', 'DROPPED', 'PAUSED']),
              media: z.object({ id: z.number().int().positive() }),
            })
          ),
        })
      ),
    }),
  }),
});

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
    const [account, settings] = await Promise.all([
      db.query.accounts.findFirst({
        columns: { accessToken: true, accountId: true },
        where: (entry, { and, eq }) =>
          and(eq(entry.userId, userId), eq(entry.providerId, 'anilist')),
      }),
      db.query.syncSettings.findFirst({
        where: (entry, { eq }) => eq(entry.userId, userId),
      }),
    ]);

    if (!account?.accessToken) {
      return fail(400, { message: 'Connect AniList before syncing.' });
    }

    if (!settings?.importAnilistChanges || !settings.watchingStatus) {
      return fail(400, { message: 'Enable AniList changes and watching status before syncing.' });
    }

    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query SyncMediaList($userId: Int!) {
            MediaListCollection(userId: $userId, type: ANIME) {
              lists {
                entries {
                  status
                  media { id }
                }
              }
            }
          }
        `,
        variables: { userId: Number(account.accountId) },
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      return fail(502, { message: 'AniList could not be reached.' });
    }

    const result = syncResponseSchema.safeParse(await response.json());
    if (!result.success) {
      return fail(502, { message: 'AniList returned an invalid sync response.' });
    }

    const stateByStatus = {
      CURRENT: 'watching',
      COMPLETED: 'completed',
      PLANNING: 'plan_to_watch',
      DROPPED: 'dropped',
      PAUSED: 'plan_to_watch',
    } as const;
    const entries = result.data.data.MediaListCollection.lists.flatMap(({ entries }) =>
      entries.map(({ media, status }) => ({ anilistId: media.id, state: stateByStatus[status] }))
    );
    const syncedAt = new Date();

    await applyWatchlistEntries(userId, entries);
    await db
      .update(syncSettings)
      .set({ lastSyncedAt: syncedAt, updatedAt: syncedAt })
      .where(eq(syncSettings.userId, userId));

    return { success: true, message: 'Sync complete.' };
  },
};
