import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { plugin, Transpiler } from 'bun';
import { compileModule } from 'svelte/compiler';
import type { Sources, Stream } from './media';
import * as preferences from './preferences';

// Run the actual rune classes with Svelte's client reactivity in Bun.
plugin({
    name: 'player-runes',
    setup(build) {
        build.onLoad({ filter: /(?:captions|playback)\.svelte\.ts$/ }, async ({ path }) => ({
            contents: compileModule(
                new Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text()),
                { filename: path, generate: 'client' }
            ).js.code,
            loader: 'js',
        }));
    },
});
mock.module('$app/navigation', () => ({ goto: mock() }));

const { Captions } = await import('./captions.svelte');
const { Playback } = await import('./playback.svelte');
const streams: Stream[] = [
    {
        provider: 'anikoto',
        server: 'HD-2',
        url: '/first.mp4',
        quality: null,
        subtitles: [{ kind: 'full', url: '/first.vtt' }],
    },
    {
        provider: 'anikoto',
        server: 'VidPlay-1',
        url: '/second.mp4',
        quality: null,
        subtitles: [{ kind: 'full', url: '/second.vtt' }],
    },
];
const vtt = 'WEBVTT\n\n00:06.750 --> 00:07.740\nWhat is this?\n';
const players: InstanceType<typeof Playback>[] = [];

function playerFor(sources: Sources = { sub: streams }) {
    const player = new Playback(sources, null);
    const video = Object.assign(Object.create(null), {
        src: '',
        currentTime: 0,
        duration: 1439,
        paused: true,
        muted: false,
        volume: 1,
        seeking: false,
        readyState: 4,
        buffered: {
            length: 0,
            start() {
                return 0;
            },
            end() {
                return 0;
            },
        },
        canPlayType() {
            return '';
        },
        pause() {
            video.paused = true;
        },
        play() {
            video.paused = false;
            return Promise.resolve();
        },
        removeAttribute(_name: string) {
            video.src = '';
        },
        load() {},
    });
    player.video = video;
    players.push(player);
    return player;
}

function mockFetch(fetcher: (url: URL | RequestInfo, init?: RequestInit) => Promise<Response>) {
    return spyOn(globalThis, 'fetch').mockImplementation(
        Object.assign(fetcher, { preconnect: globalThis.fetch.preconnect })
    );
}

beforeEach(() => {
    spyOn(preferences, 'save').mockImplementation(() => {});
});

afterEach(() => {
    for (const player of players.splice(0)) {
        player.handlePlaying();
        player.captions.clear();
    }
    mock.restore();
});

test('clearing a track clears the English indicator immediately', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(new Response(vtt));
    const captions = new Captions();
    await captions.load({ sub: streams }, 'sub', streams[0], streams[0].url);
    expect(captions.mode).toBe('full');
    captions.clear();
    expect(captions.mode).toBe('off');
    expect(captions.cues).toEqual([]);
});

test('preserves the selected SDH mode across an internal reload clear', async () => {
    const captions = new Captions();
    captions.select('sdh');
    mockFetch(async (url) =>
        String(url) === '/full.vtt'
            ? new Response('WEBVTT\n\n00:00.000 --> 00:01.000\nFull\n')
            : new Response('WEBVTT\n\n00:00.000 --> 00:01.000\nSDH\n')
    );
    await captions.load(
        {
            sub: [
                {
                    ...streams[0],
                    subtitles: [
                        { kind: 'full', url: '/full.vtt' },
                        { kind: 'sdh', url: '/sdh.vtt' },
                    ],
                },
            ],
        },
        'sub',
        {
            ...streams[0],
            subtitles: [
                { kind: 'full', url: '/full.vtt' },
                { kind: 'sdh', url: '/sdh.vtt' },
            ],
        },
        streams[0].url
    );
    expect(captions.mode).toBe('sdh');
    captions.clear();
    expect(captions.mode).toBe('off');
    await captions.load(
        {
            sub: [
                {
                    ...streams[0],
                    subtitles: [
                        { kind: 'full', url: '/full.vtt' },
                        { kind: 'sdh', url: '/sdh.vtt' },
                    ],
                },
            ],
        },
        'sub',
        {
            ...streams[0],
            subtitles: [
                { kind: 'full', url: '/full.vtt' },
                { kind: 'sdh', url: '/sdh.vtt' },
            ],
        },
        streams[0].url
    );
    expect(captions.mode).toBe('sdh');
});

test('honors a restored mode set before the first internal clear', async () => {
    const captions = new Captions();
    captions.mode = 'sdh';
    mockFetch(async (url) =>
        String(url) === '/full.vtt'
            ? new Response('WEBVTT\n\n00:00.000 --> 00:01.000\nFull\n')
            : new Response('WEBVTT\n\n00:00.000 --> 00:01.000\nSDH\n')
    );
    const source = {
        ...streams[0],
        subtitles: [
            { kind: 'full' as const, url: '/full.vtt' },
            { kind: 'sdh' as const, url: '/sdh.vtt' },
        ],
    };
    await captions.load({ sub: [source] }, 'sub', source, source.url);
    expect(captions.mode).toBe('sdh');
    captions.clear();
    await captions.load({ sub: [source] }, 'sub', source, source.url);
    expect(captions.mode).toBe('sdh');
});

test.each([
    { status: 502, body: '' },
    { status: 200, body: 'WEBVTT\n\n' },
    { status: 200, body: '<html>upstream error</html>' },
])('falls back to a working subtitled encode when captions fail', async ({ status, body }) => {
    mockFetch(async (url) =>
        String(url) === '/first.vtt' ? new Response(body, { status }) : new Response(vtt)
    );
    const player = playerFor();
    await player.changeEpisode();
    expect(player.src).toBe('/second.mp4');
    expect(player.video.src).toBe('/second.mp4');
    player.currentTime = 7;
    expect(player.subtitles).toEqual(['What is this?']);
    expect(player.captions.mode).toBe('full');
});

test('exhausted subtitle sources enter playback error instead of playing without captions', async () => {
    mockFetch(async () => new Response('WEBVTT\n\n'));
    const player = playerFor();
    await player.changeEpisode();
    // A failure queued while changing sources finishes in the next microtask.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(player.error).toBe(true);
    expect(player.captions.mode).toBe('off');
    expect(player.video.src).toBe('');
});

test('a stale caption response cannot overwrite the newly selected source', async () => {
    const pending = Promise.withResolvers<Response>();
    mockFetch(async (url) => (String(url) === '/first.vtt' ? pending.promise : new Response(vtt)));
    const captions = new Captions();
    const old = captions.load({ sub: streams }, 'sub', streams[0], streams[0].url);
    await captions.load({ sub: streams }, 'sub', streams[1], streams[1].url);
    pending.resolve(new Response('WEBVTT\n\n00:00.000 --> 00:10.000\nWrong encode\n'));
    await old;
    expect(captions.cues.map(({ text }) => text)).toEqual(['What is this?']);
});

test('a manually selected last server can fall back to earlier servers without losing position', async () => {
    mockFetch(async (url) =>
        String(url) === '/second.vtt' ? new Response(null, { status: 404 }) : new Response(vtt)
    );
    const player = playerFor();
    player.video.currentTime = 7;
    player.currentTime = 7;
    await player.switchSource('sub', streams[1]);
    player.autoplay = false;
    player.handleMetadata();
    expect(player.src).toBe('/first.mp4');
    expect(player.currentTime).toBe(7);
    expect(player.subtitles).toEqual(['What is this?']);
});

test.each([{ subtitles: [] }, { subtitles: [{ kind: 'forced' as const, url: '/signs.vtt' }] }])(
    'missing dialogue subtitles cannot start SUB video',
    async ({ subtitles }) => {
        const player = playerFor({ sub: [{ ...streams[0], subtitles: [...subtitles] }] });
        await player.changeEpisode();
        expect(player.error).toBe(true);
        expect(player.video.src).toBe('');
    }
);

test('captions explicitly disabled do not block playback on a pending caption request', async () => {
    const pending = Promise.withResolvers<Response>();
    mockFetch(async () => pending.promise);
    const player = playerFor();
    player.captions.enabled = false;
    await player.changeEpisode();
    expect(player.video.src).toBe('/first.mp4');
    pending.resolve(new Response(vtt));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(player.captions.mode).toBe('off');
    expect(player.subtitles).toEqual([]);
});

test('SUB media waits until its captions have loaded', async () => {
    const pending = Promise.withResolvers<Response>();
    mockFetch(async () => pending.promise);
    const player = playerFor();
    const loading = player.changeEpisode();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(player.video.src).toBe('');
    expect(player.captions.mode).toBe('off');
    pending.resolve(new Response(vtt));
    await loading;
    expect(player.video.src).toBe('/first.mp4');
    expect(player.captions.mode).toBe('full');
});
