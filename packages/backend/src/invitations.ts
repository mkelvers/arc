import { createHash } from 'node:crypto';

import { and, eq, gt, isNotNull, isNull, or } from 'drizzle-orm';

import { db } from '@arc/db';
import { invitations, users } from '@arc/db/schema';

export class InvalidInvitationError extends Error {
    constructor() {
        super('The invitation is invalid or already used');
        this.name = 'InvalidInvitationError';
    }
}

export class InvitationCompletionError extends Error {
    constructor(options?: ErrorOptions) {
        super('The invitation could not be completed', options);
        this.name = 'InvitationCompletionError';
    }
}

type CreatedAccount = { id: string; name: string; username: string };

export async function registerInvitedAccount(
    invitationCode: string,
    createAccount: (reservationId: string) => Promise<CreatedAccount>
) {
    const reservationId = crypto.randomUUID();
    if (!(await claimInvitation(invitationCode, reservationId))) {
        throw new InvalidInvitationError();
    }

    let account: CreatedAccount | undefined;
    try {
        account = await createAccount(reservationId);
        if (!(await completeInvitation(reservationId, account.id))) {
            throw new InvitationCompletionError();
        }
        return account;
    } catch (cause) {
        if (account) {
            try {
                await db.delete(users).where(eq(users.id, account.id));
            } catch {
                // Cleanup is best effort; the API logs and maps the original registration failure.
            }
        }
        try {
            await restoreInvitation(reservationId);
        } catch {
            // Cleanup is best effort; the API logs and maps the original registration failure.
        }
        throw cause;
    }
}

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
