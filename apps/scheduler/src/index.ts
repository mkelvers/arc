import { runAnimeScheduler } from '@arc/backend/internal/anime/scheduler/run';
import { db } from '@arc/db';
import { z } from 'zod';

const positiveInteger = (fallback: number, minimum: number, maximum: number) =>
    z.preprocess(
        (value) => (value === undefined || value === '' ? fallback : Number(value)),
        z.number().int().min(minimum).max(maximum)
    );

const config = z
    .object({
        DATABASE_URL: z.url(),
        ARC_SCHEDULER_CONCURRENCY: positiveInteger(3, 1, 10),
        ARC_SCHEDULER_MAX_CLAIMED_TARGETS: positiveInteger(25, 1, 250),
        ARC_SCHEDULER_CLAIMING_WINDOW_SECONDS: positiveInteger(240, 30, 600),
        ARC_SCHEDULER_LEASE_SECONDS: positiveInteger(600, 60, 3_600),
        ARC_SCHEDULER_LEASE_RENEWAL_SECONDS: positiveInteger(180, 15, 1_800),
        ARC_SCHEDULER_FULL_RECONCILIATION_SECONDS: positiveInteger(3_600, 300, 86_400),
        ARC_SCHEDULER_POLL_SECONDS: positiveInteger(300, 15, 3_600),
    })
    .transform((environment) => {
        if (
            environment.ARC_SCHEDULER_LEASE_RENEWAL_SECONDS * 2 >
            environment.ARC_SCHEDULER_LEASE_SECONDS
        ) {
            throw new RangeError(
                'ARC_SCHEDULER_LEASE_RENEWAL_SECONDS must be no more than half of ARC_SCHEDULER_LEASE_SECONDS'
            );
        }

        return {
            concurrency: environment.ARC_SCHEDULER_CONCURRENCY,
            maxClaimedTargets: environment.ARC_SCHEDULER_MAX_CLAIMED_TARGETS,
            claimingWindowMs: environment.ARC_SCHEDULER_CLAIMING_WINDOW_SECONDS * 1_000,
            leaseDurationMs: environment.ARC_SCHEDULER_LEASE_SECONDS * 1_000,
            leaseRenewalMs: environment.ARC_SCHEDULER_LEASE_RENEWAL_SECONDS * 1_000,
            fullReconciliationIntervalMs:
                environment.ARC_SCHEDULER_FULL_RECONCILIATION_SECONDS * 1_000,
            pollIntervalMs: environment.ARC_SCHEDULER_POLL_SECONDS * 1_000,
        };
    })
    .parse(process.env);

let stopping = false;
process.once('SIGINT', () => {
    stopping = true;
});
process.once('SIGTERM', () => {
    stopping = true;
});

try {
    console.info('Arc anime scheduler service started');
    while (!stopping) {
        try {
            console.info('Arc anime scheduler run started');
            console.info('Arc anime scheduler run completed', await runAnimeScheduler(config));
        } catch (cause) {
            console.error('Arc anime scheduler run failed', cause);
        }

        if (!stopping) {
            await Bun.sleep(config.pollIntervalMs);
        }
    }
} finally {
    await db.$client.end();
    console.info('Arc anime scheduler service stopped');
}
