import { describe, expect, test } from 'bun:test';

import { GraphQLRequestError } from '../../graphql';
import { logSchedulerEvent } from './log';

describe('scheduler logging', () => {
    test('emits the correlation fields without the error message', () => {
        const messages: string[] = [];
        const original = console.info;
        console.info = (message: string) => messages.push(message);
        try {
            logSchedulerEvent({
                runId: 'run-1',
                taskType: 'release_refresh',
                outcome: 'retried',
                durationMs: 42,
                retryAt: new Date('2026-08-28T00:00:00.000Z'),
                cause: new GraphQLRequestError({
                    message: 'private provider response',
                    status: 429,
                }),
            });
        } finally {
            console.info = original;
        }

        expect(JSON.parse(messages[0]!)).toEqual({
            event: 'arc.scheduler',
            runId: 'run-1',
            taskType: 'release_refresh',
            outcome: 'retried',
            durationMs: 42,
            retryAt: '2026-08-28T00:00:00.000Z',
            errorClass: 'anilist_rate_limited',
        });
    });
});
