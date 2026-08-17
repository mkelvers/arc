import type { DatabaseTransaction } from '$lib/server/db';
import { notification } from '$lib/server/db/schema';
import { batches } from '$lib/utils';
import type { NotificationEventInput } from './events';

export async function persistNotificationEvents(
    inputs: readonly NotificationEventInput[],
    writer: Pick<DatabaseTransaction, 'insert'>
) {
    const created: Array<typeof notification.$inferSelect> = [];

    for (const batch of batches(inputs, 1_000)) {
        created.push(
            ...(await writer
                .insert(notification)
                .values(batch)
                .onConflictDoNothing({
                    target: [notification.userId, notification.dedupeKey],
                })
                .returning())
        );
    }

    return created;
}
