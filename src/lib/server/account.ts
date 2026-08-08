import { eq } from 'drizzle-orm';

import { accountArtSource } from '$lib/server/account-art';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

export async function getAccount(userId: string) {
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

  return { ...account, artSource: await accountArtSource(userId) };
}
