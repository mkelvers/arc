import { createHash } from 'node:crypto';

import { and, eq, gt, isNotNull, isNull, or } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { invitations } from '$lib/server/db/schema';

export async function claimInvitation(code: string, claim: string) {
  const now = new Date();
  const [invitation] = await db
    .update(invitations)
    .set({ reservationId: claim, reservedAt: now, usedAt: now })
    .where(
      and(
        eq(invitations.codeHash, createHash('sha256').update(code.trim()).digest('hex')),
        isNull(invitations.usedAt),
        isNull(invitations.reservationId),
        or(isNull(invitations.expiresAt), gt(invitations.expiresAt, now))
      )
    )
    .returning({ id: invitations.id });
  return invitation !== undefined;
}

export async function hasInvitationClaim(claim: string) {
  const [invitation] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.reservationId, claim),
        isNotNull(invitations.usedAt),
        isNull(invitations.usedByUserId)
      )
    )
    .limit(1);
  return invitation !== undefined;
}

export async function completeInvitation(claim: string, userId: string) {
  const [invitation] = await db
    .update(invitations)
    .set({ reservationId: null, reservedAt: null, usedByUserId: userId })
    .where(
      and(
        eq(invitations.reservationId, claim),
        isNotNull(invitations.usedAt),
        isNull(invitations.usedByUserId)
      )
    )
    .returning({ id: invitations.id });
  return invitation !== undefined;
}

export async function restoreInvitation(claim: string) {
  await db
    .update(invitations)
    .set({ reservationId: null, reservedAt: null, usedAt: null })
    .where(and(eq(invitations.reservationId, claim), isNull(invitations.usedByUserId)));
}
