import { Hono } from 'hono';
import { z } from 'zod';

import { AnimeIdSchema } from '@arc/api-contract/anime';
import {
    animePage,
    mediaPage,
    updateMedia,
    watchPage,
    watchPlayback,
    watchSegments,
} from '@arc/backend/internal/anime/application';
import { getEpisodeRevision } from '@arc/backend/internal/anime/episodes';
import { middleware, validate, type ApiEnvironment } from '../http';

const AnimeParamSchema = z.object({ anilistId: AnimeIdSchema });
const EpisodeParamSchema = AnimeParamSchema.extend({ episodeId: z.string().min(1).max(512) });
const MediaRequestSchema = z.discriminatedUnion('intent', [
    z.object({ intent: z.literal('refresh') }),
    z.object({ intent: z.literal('logoSize'), logoSize: z.number() }),
    z.object({
        intent: z.literal('select'),
        type: z.enum(['backdrop', 'logo']),
        filePath: z.string().nullable(),
    }),
]);

export const anime = new Hono<ApiEnvironment>();

anime.use('*', middleware);

anime.get('/:anilistId', validate('param', AnimeParamSchema), async (context) => {
    return context.json(
        await animePage(context.get('session').user.id, context.req.valid('param').anilistId)
    );
});

anime.get('/:anilistId/episodes/revision', validate('param', AnimeParamSchema), async (context) =>
    context.json({ revision: await getEpisodeRevision(context.req.valid('param').anilistId) })
);

anime.get(
    '/:anilistId/episodes/:episodeId',
    validate('param', EpisodeParamSchema),
    async (context) => {
        const { anilistId, episodeId } = context.req.valid('param');
        const page = await watchPage(context.get('session').user.id, anilistId, episodeId);
        if (!page) {
            return context.json(
                { error: { code: 'NOT_FOUND', message: 'Episode not found' } },
                404
            );
        }

        return context.json(page);
    }
);

anime.get(
    '/:anilistId/episodes/:episodeId/segments',
    validate('param', EpisodeParamSchema),
    async (context) => {
        const { anilistId, episodeId } = context.req.valid('param');
        const segments = await watchSegments(anilistId, episodeId);
        return segments
            ? context.json(segments)
            : context.json({ error: { code: 'NOT_FOUND', message: 'Episode not found' } }, 404);
    }
);

anime.get(
    '/:anilistId/episodes/:episodeId/playback',
    validate('param', EpisodeParamSchema),
    async (context) => {
        const { anilistId, episodeId } = context.req.valid('param');
        const playback = await watchPlayback(anilistId, episodeId);
        if (!playback) {
            return context.json(
                { error: { code: 'NOT_FOUND', message: 'Episode not found' } },
                404
            );
        }

        return context.json({
            ...playback,
            streams: Object.fromEntries(
                Object.entries(playback.streams).map(([mode, sources]) => [
                    mode,
                    (sources ?? []).map((source) => ({
                        ...source,
                        url:
                            source.kind === 'iframe'
                                ? source.url
                                : `/v1/stream?${new URLSearchParams({ url: source.url })}`,
                        subtitleUrl: source.subtitleUrl
                            ? `/v1/stream?${new URLSearchParams({ url: source.subtitleUrl })}`
                            : null,
                    })),
                ])
            ),
        });
    }
);

anime.get('/:anilistId/media', validate('param', AnimeParamSchema), async (context) => {
    return context.json(await mediaPage(context.req.valid('param').anilistId));
});

anime.put(
    '/:anilistId/media',
    validate('param', AnimeParamSchema),
    validate('json', MediaRequestSchema),
    async (context) => {
        await updateMedia(context.req.valid('param').anilistId, context.req.valid('json'));
        return context.json({ success: true });
    }
);
