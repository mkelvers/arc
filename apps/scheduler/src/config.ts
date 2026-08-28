import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const positiveInteger = (fallback: number, minimum: number, maximum: number) =>
    z.preprocess(
        (value) => (value === undefined || value === '' ? fallback : Number(value)),
        z.number().int().min(minimum).max(maximum)
    );

const SchedulerEnvironmentSchema = z.object({
    DATABASE_URL: z.url(),
    ARC_SCHEDULER_CONCURRENCY: positiveInteger(3, 1, 10),
    ARC_SCHEDULER_MAX_CLAIMED_TARGETS: positiveInteger(25, 1, 250),
    ARC_SCHEDULER_CLAIMING_WINDOW_SECONDS: positiveInteger(240, 30, 600),
    ARC_SCHEDULER_LEASE_SECONDS: positiveInteger(600, 60, 3_600),
    ARC_SCHEDULER_LEASE_RENEWAL_SECONDS: positiveInteger(180, 15, 1_800),
    ARC_SCHEDULER_FULL_RECONCILIATION_SECONDS: positiveInteger(3_600, 300, 86_400),
    ARC_SCHEDULER_POLL_SECONDS: positiveInteger(300, 15, 3_600),
});

export function schedulerEnvironmentPath() {
    return resolve(import.meta.dir, '../.env');
}

export async function loadSchedulerConfig() {
    const path = schedulerEnvironmentPath();
    if (await Bun.file(path).exists()) {
        const loaded = loadEnv({ path, override: false, quiet: true });
        if (loaded.error) {
            throw new Error(`Scheduler configuration could not be loaded from ${path}`, {
                cause: loaded.error,
            });
        }
    }

    const environment = SchedulerEnvironmentSchema.parse(process.env);
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
        fullReconciliationIntervalMs: environment.ARC_SCHEDULER_FULL_RECONCILIATION_SECONDS * 1_000,
        pollIntervalMs: environment.ARC_SCHEDULER_POLL_SECONDS * 1_000,
    };
}
