import { expect, mock, test } from 'bun:test';

const execute = mock(async () => []);

mock.module('@arc/shared/db', () => ({
    db: { execute },
}));

const { isReady, markMigrationsReady } = await import('./readiness');

test('stays unready until startup migrations finish', async () => {
    expect(await isReady()).toBe(false);
    expect(execute).not.toHaveBeenCalled();

    markMigrationsReady();

    expect(await isReady()).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
});

test('reports the database as unready when the readiness query fails', async () => {
    execute.mockRejectedValueOnce(new Error('database unavailable'));

    expect(await isReady()).toBe(false);
});
