const minute = 60_000;
const day = 24 * 60 * minute;

function schedulerSetting(name: string, fallback: number, minimum: number) {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value >= minimum ? value : fallback;
}

function schedulerSecondsSetting(name: string, fallback: number, minimum: number) {
    return schedulerSetting(name, fallback / 1_000, minimum / 1_000) * 1_000;
}

export const schedulerPolicy = {
    concurrency: schedulerSetting('ARC_SCHEDULER_CONCURRENCY', 1, 1),
    maxClaimedTargets: schedulerSetting('ARC_SCHEDULER_MAX_CLAIMED_TARGETS', 25, 1),
    claimingWindowMs: schedulerSecondsSetting(
        'ARC_SCHEDULER_CLAIMING_WINDOW_SECONDS',
        240 * 1_000,
        1_000
    ),
    leaseDurationMs: schedulerSecondsSetting('ARC_SCHEDULER_LEASE_SECONDS', 600 * 1_000, 30_000),
    leaseRenewalMs: schedulerSecondsSetting(
        'ARC_SCHEDULER_LEASE_RENEWAL_SECONDS',
        180 * 1_000,
        10_000
    ),
    fullReconciliationIntervalMs: schedulerSecondsSetting(
        'ARC_SCHEDULER_FULL_RECONCILIATION_SECONDS',
        3_600 * 1_000,
        60_000
    ),
    calendarRefreshIntervalMs: schedulerSecondsSetting(
        'ARC_SCHEDULER_CALENDAR_REFRESH_SECONDS',
        15 * 60 * 1_000,
        60_000
    ),
} as const;

export const schedulerRunLease = {
    durationMs: 2 * minute,
    renewalMs: 30_000,
} as const;

export function firstEpisodeAttemptAt(airingAt: Date) {
    return new Date(airingAt.getTime() - 30 * minute);
}

export function nextEpisodeAttemptAt(airingAt: Date, now: Date) {
    const deadline = airingAt.getTime() + 14 * day;
    const nextAttemptAt = now.getTime() + minute;
    if (nextAttemptAt > deadline) {
        return null;
    }

    return new Date(nextAttemptAt);
}
