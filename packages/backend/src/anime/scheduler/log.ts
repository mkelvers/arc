import { GraphQLRequestError } from '../../graphql';

export type SchedulerTaskOutcome = 'started' | 'completed' | 'retried' | 'failed' | 'skipped';

function errorClass(cause: unknown) {
    if (cause instanceof GraphQLRequestError) {
        if (cause.status === 429) {
            return 'anilist_rate_limited';
        }
        if (cause.status === undefined) {
            return 'upstream_network';
        }
        if (cause.status >= 500) {
            return 'upstream_server';
        }
        return 'upstream_request';
    }

    if (cause instanceof Error) {
        return cause.name === 'AbortError' || cause.name === 'TimeoutError'
            ? 'timeout'
            : 'application';
    }

    return 'unknown';
}

export function logSchedulerEvent(input: {
    runId: string;
    taskType: string;
    outcome: SchedulerTaskOutcome;
    durationMs: number;
    retryAt?: Date | null;
    cause?: unknown;
}) {
    console.info(
        JSON.stringify({
            event: 'arc.scheduler',
            runId: input.runId,
            taskType: input.taskType,
            outcome: input.outcome,
            durationMs: input.durationMs,
            retryAt: input.retryAt?.toISOString() ?? null,
            errorClass: input.cause ? errorClass(input.cause) : null,
        })
    );
}
