import { afterEach, expect, jest, spyOn, test } from 'bun:test';

import { getAniKotoSimulcastPage } from '../../../packages/core/src/providers/anikoto';

afterEach(() => {
    jest.useRealTimers();
});

test('expires successful and rejected series requests without another cache lookup', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    let requests = 0;
    let fail = false;
    const originalFetch = globalThis.fetch;
    using _fetch = spyOn(globalThis, 'fetch').mockImplementation(
        Object.assign(
            async (target: URL | RequestInfo) => {
                jest.advanceTimersByTime(1_000);
                const url = String(target);
                if (url.startsWith('https://anikototv.to/filter')) {
                    return new Response(
                        '<div id="list-items"><div class="item"><div class="poster" data-tip="998877"></div></div></div>'
                    );
                }
                expect(url).toBe('https://anikotoapi.site/series/998877');
                requests += 1;
                // A valid series without an AniList identity never writes a provider mapping.
                return Response.json(
                    fail
                        ? { ok: false }
                        : {
                              ok: true,
                              data: {
                                  anime: { id: 998877, title: 'Unmapped release' },
                                  episodes: [],
                              },
                          }
                );
            },
            { preconnect: originalFetch.preconnect }
        )
    );

    async function requestPage() {
        await expect(getAniKotoSimulcastPage({ season: 'WINTER', year: 2030 }, 1)).rejects.toThrow(
            'AniKoto catalog identities could not be loaded'
        );
    }

    await requestPage();
    expect(requests).toBe(1);
    await requestPage();
    expect(requests).toBe(1);
    jest.advanceTimersByTime(60_000);
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(5 * 60_000);
    expect(jest.getTimerCount()).toBe(0);

    fail = true;
    await requestPage();
    expect(requests).toBe(2);
    await requestPage();
    expect(requests).toBe(2);
    jest.advanceTimersByTime(30_000);
    expect(jest.getTimerCount()).toBe(0);
    await requestPage();
    expect(requests).toBe(3);
});
