import { expect, test } from 'bun:test';

import { runMigrationsWithRetry } from './startup';

test('retries startup migrations with exponential backoff', async () => {
    let attempts = 0;
    const delays: number[] = [];

    await runMigrationsWithRetry(
        async () => {
            attempts += 1;
            if (attempts < 3) {
                throw new Error('database is still starting');
            }
        },
        async (delay) => {
            delays.push(delay);
        }
    );

    expect(attempts).toBe(3);
    expect(delays).toEqual([1_000, 2_000]);
});

test('stops after the startup migration retry budget is exhausted', async () => {
    let attempts = 0;
    const migrationError = new Error('migration failed');

    await expect(
        runMigrationsWithRetry(
            async () => {
                attempts += 1;
                throw migrationError;
            },
            async () => {}
        )
    ).rejects.toBe(migrationError);

    expect(attempts).toBe(6);
});
