import { redirect } from '@sveltejs/kit';

import {
  clearNotifications,
  getNotifications,
  markNotificationsRead,
} from '$lib/server/notifications';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    redirect(303, '/login');
  }

  const notifications = await getNotifications(locals.user.id);

  return {
    pageTitle: 'Notification Center',
    notifications,
  };
};

export const actions: Actions = {
  readAll: async ({ locals }) => {
    if (!locals.user) {
      redirect(303, '/login');
    }

    await markNotificationsRead(locals.user.id);
  },
  clearAll: async ({ locals }) => {
    if (!locals.user) {
      redirect(303, '/login');
    }

    await clearNotifications(locals.user.id);
  },
};
