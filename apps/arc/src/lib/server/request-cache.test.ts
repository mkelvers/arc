import { expect, test } from 'bun:test';

import { RequestCache } from '@arc/backend/internal/request-cache';

test('request cache shares active work and caches successful values', async () => {
    const cache = new RequestCache<string, number>(1_000);
    let calls = 0;
    const load = async () => ++calls;

    const [first, second] = await Promise.all([cache.get('key', load), cache.get('key', load)]);

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

    expect(cache.get('key', load)).rejects.toThrow('unavailable');
    expect(cache.get('key', load)).resolves.toBe(2);
});

test('request cache can retain a stale value when refresh fails', async () => {
    const cache = new RequestCache<string, number>(1);
    let calls = 0;
    const load = async () => {
        calls += 1;
        if (calls > 1) {
            throw new Error('unavailable');
        }
        return calls;
    };

    expect(cache.get('key', load)).resolves.toBe(1);
    await Bun.sleep(5);
    const [refresh, concurrent] = await Promise.all([
        cache.get('key', load, { staleIfError: true }),
        cache.get('key', load, { staleIfError: true }),
    ]);
    expect(refresh).toBe(1);
    expect(concurrent).toBe(1);
    expect(calls).toBe(2);
});

test('request cache serves stale data immediately while one refresh runs', async () => {
    const cache = new RequestCache<string, number>(100);
    let calls = 0;
    let finishRefresh: ((value: number) => void) | undefined;
    const load = () => {
        calls += 1;
        if (calls === 1) {
            return Promise.resolve(1);
        }

        return new Promise<number>((resolve) => {
            finishRefresh = resolve;
        });
    };

    expect(cache.get('key', load)).resolves.toBe(1);
    await Bun.sleep(110);

    expect(cache.get('key', load, { staleWhileRevalidate: true })).resolves.toBe(1);
    expect(cache.get('key', load, { staleWhileRevalidate: true })).resolves.toBe(1);
    await Bun.sleep(1);
    expect(calls).toBe(2);

    finishRefresh?.(2);
    await Bun.sleep(1);
    expect(cache.get('key', load)).resolves.toBe(2);
});
