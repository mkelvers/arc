import { redirect } from '@sveltejs/kit';

import { getNotifications, markNotificationsRead } from '$lib/server/notifications';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    redirect(303, '/login');
  }

  const notifications = await getNotifications(locals.user.id);
  await markNotificationsRead(locals.user.id);

  return {
    pageTitle: 'Notification Center',
    notifications,
  };
};
