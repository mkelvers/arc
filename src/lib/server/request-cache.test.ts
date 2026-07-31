import { expect, test } from 'bun:test';

import { RequestCache } from './request-cache';

test('request cache shares active work and caches successful values', async () => {
    const cache = new RequestCache<string, number>(1_000);
    let calls = 0;
    const load = async () => ++calls;

    const [first, second] = await Promise.all([
        cache.get('key', load),
        cache.get('key', load),
    ]);

    expect(first).toBe(1);
    expect(second).toBe(1);
    expect(await cache.get('key', load)).toBe(1);
    expect(calls).toBe(1);
});

test('request cache does not retain failures', async () => {
    const cache = new RequestCache<string, number>(1_000);
    let calls = 0;
    const load = async () => {
        calls += 1;
        if (calls === 1) {
            throw new Error('unavailable');
        }
        return calls;
    };

    await expect(cache.get('key', load)).rejects.toThrow('unavailable');
    await expect(cache.get('key', load)).resolves.toBe(2);
});
