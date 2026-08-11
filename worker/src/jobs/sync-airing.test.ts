import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Queue } from 'bullmq';
import type * as AiringJobs from './sync-airing';

const scheduledAt = Date.now() + 60 * 60 * 1_000;
const added: Array<{ name: string; data: unknown; options: Record<string, unknown> }> = [];
let airingJobs: typeof AiringJobs;
let episodeAvailable = false;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
    server = Bun.serve({
        port: 0,
        routes: {
            '/api/internal/sync/airing': {
                GET: () =>
                    Response.json([
                        {
                            id: 42,
                            airingAt: Math.floor(scheduledAt / 1_000),
                            episode: 6,
                            refreshNow: true,
                            refreshEpisode: 5,
                        },
                    ]),
                POST: () =>
                    Response.json({
                        episodeAvailable,
                        mediaStatus: 'RELEASING',
                    }),
            },
        },
    });
    process.env.ARC_WEB_URL = server.url.toString().replace(/\/$/, '');
    process.env.ARC_WORKER_TOKEN = 'test-worker-token';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    process.env.TZ = 'UTC';
    airingJobs = await import('./sync-airing');
});

afterAll(() => server.stop(true));

const queue = {
    add: async (name: string, data: unknown, options: Record<string, unknown>) => {
        added.push({ name, data, options });
    },
} as unknown as Queue;

describe('airing episode jobs', () => {
    test('reconciles a missed episode now and schedules the next release', async () => {
        added.length = 0;

        await airingJobs.scanAiring(queue);

        expect(added).toHaveLength(2);
        expect(added[0]).toMatchObject({
            name: 'sync-airing',
            data: { anilistId: 42, targetEpisode: 5 },
            options: { delay: 0 },
        });
        expect(added[1]).toMatchObject({
            name: 'sync-airing',
            data: { anilistId: 42, targetEpisode: 6 },
        });
        expect(added[1].options.delay).toBeGreaterThan(0);
    });

    test('reports when the target episode is still absent', async () => {
        episodeAvailable = false;

        await expect(airingJobs.syncAiring(42, 6)).resolves.toMatchObject({
            episodeAvailable: false,
            mediaStatus: 'RELEASING',
        });
    });
});
