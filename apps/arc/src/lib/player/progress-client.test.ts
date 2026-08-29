import { afterEach, describe, expect, test } from 'bun:test';

import { PlaybackProgress } from './progress-client';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function media(currentTime = 42, seeking = false) {
    return {
        currentTime,
        playing: false,
        seeking,
        video: {
            currentTime,
            duration: 120,
            seeking,
        },
    };
}

async function flushSave() {
    for (let index = 0; index < 5; index += 1) {
        await Promise.resolve();
    }
}

describe('playback progress client', () => {
    test('keeps the navigation save behind an earlier pause save', async () => {
        const bodies: string[] = [];
        globalThis.fetch = (async (_input, init) => {
            bodies.push(String(init?.body));
            return new Response(null, { status: 204 });
        }) as typeof fetch;

        const progressMedia = media();
        const progress = new PlaybackProgress(
            progressMedia,
            {
                animeId: 21,
                episodeId: 'episode-7',
                episodeNumber: 7,
            },
            Date.now() - 1_000,
            Date.now() - 1_000
        );
        progress.mount(Date.now() - 1_000);
        progress.paused(false);
        progress.leavePage();
        await flushSave();

        expect(bodies).toHaveLength(2);
        expect(JSON.parse(bodies[0]).eventAt).toBeLessThan(JSON.parse(bodies[1]).eventAt);
    });

    test('saves the current position when playback is paused', async () => {
        const bodies: string[] = [];
        globalThis.fetch = (async (_input, init) => {
            bodies.push(String(init?.body));
            return new Response(null, { status: 204 });
        }) as typeof fetch;

        const progressMedia = media();
        const progress = new PlaybackProgress(
            progressMedia,
            {
                animeId: 21,
                episodeId: 'episode-7',
                episodeNumber: 7,
            },
            Date.now() - 1_000,
            Date.now() - 1_000
        );
        progress.mount(Date.now() - 1_000);
        progress.paused(false);
        await flushSave();

        expect(bodies).toHaveLength(1);
        expect(JSON.parse(bodies[0])).toMatchObject({
            animeId: 21,
            episodeId: 'episode-7',
            positionSeconds: 42,
            durationSeconds: 120,
            completed: false,
        });
    });

    test('saves the logical seek position when the page is left mid-seek', async () => {
        const bodies: string[] = [];
        globalThis.fetch = (async (_input, init) => {
            bodies.push(String(init?.body));
            return new Response(null, { status: 204 });
        }) as typeof fetch;

        const progressMedia = media(77, true);
        const progress = new PlaybackProgress(
            progressMedia,
            {
                animeId: 21,
                episodeId: 'episode-7',
                episodeNumber: 7,
            },
            Date.now() - 1_000,
            Date.now() - 1_000
        );
        progress.mount(Date.now() - 1_000);
        progress.leavePage();
        await flushSave();

        expect(bodies).toHaveLength(1);
        expect(JSON.parse(bodies[0])).toMatchObject({
            positionSeconds: 77,
            durationSeconds: 120,
        });
    });

    test('keeps the logical position while the video source is being replaced', async () => {
        const bodies: string[] = [];
        globalThis.fetch = (async (_input, init) => {
            bodies.push(String(init?.body));
            return new Response(null, { status: 204 });
        }) as typeof fetch;

        const progressMedia = media(0);
        progressMedia.currentTime = 90;
        const progress = new PlaybackProgress(
            progressMedia,
            {
                animeId: 21,
                episodeId: 'episode-7',
                episodeNumber: 7,
            },
            Date.now() - 1_000,
            Date.now() - 1_000
        );
        progress.mount(Date.now() - 1_000);
        progress.leavePage();
        await flushSave();

        expect(JSON.parse(bodies[0])).toMatchObject({
            positionSeconds: 90,
            durationSeconds: 120,
        });
    });
});
