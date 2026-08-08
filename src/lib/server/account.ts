import { eq } from 'drizzle-orm';

import { renderAccountArt } from '$lib/server/account-art';
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

  const art = await renderAccountArt(userId);
  return {
    ...account,
    artSource: `data:image/svg+xml;base64,${Buffer.from(art).toString('base64')}`,
  };
}
