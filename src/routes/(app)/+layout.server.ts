import { getAccount } from '$lib/server/account';
import { getUnreadNotificationCount } from '$lib/server/notifications';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) {
    return { account: null };
  }

  const [account, unreadNotifications] = await Promise.all([
    getAccount(locals.user.id),
    getUnreadNotificationCount(locals.user.id),
  ]);

  return { account, unreadNotifications };
};
