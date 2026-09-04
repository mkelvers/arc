import { Hono } from 'hono';

import {
    parsePlaybackProgress,
    PlaybackProgressSchema,
    saveEpisodeSegment,
    savePlaybackProgress,
    SegmentRequestSchema,
    validSkipInterval,
} from '@arc/core/server';
import { middleware, validate, type ApiEnvironment } from '../http';
import { proxyStreamRequest, StreamProxyError } from '../stream';

export const playback = new Hono<ApiEnvironment>();

playback.use('*', middleware);

playback.get('/stream', async (context) => {
    try {
        return await proxyStreamRequest(context.req.raw, fetch);
    } catch (cause) {
        if (!(cause instanceof StreamProxyError)) {
            throw cause;
        }

        const status =
            cause.reason.kind === 'missing-source' || cause.reason.kind === 'invalid-source'
                ? 400
                : cause.reason.kind === 'unsupported-host' ||
                    cause.reason.kind === 'unsupported-redirect'
                  ? 403
                  : cause.reason.kind === 'body-timeout'
                    ? 504
                    : 502;
        return context.json(
            {
                error: {
                    code: 'STREAM_FAILED',
                    message: 'Episode stream failed',
                },
            },
            status
        );
    }
});

playback.post('/progress', validate('json', PlaybackProgressSchema), async (context) => {
    const input = parsePlaybackProgress(context.req.valid('json'));
    if (!input) {
        return context.json(
            {
                error: {
                    code: 'INVALID_REQUEST',
                    message: 'Invalid playback progress',
                },
            },
            400
        );
    }
    const saved = await savePlaybackProgress(context.get('session').user.id, input);
    return saved
        ? context.body(null, 204)
        : context.json(
              {
                  error: {
                      code: 'INVALID_REQUEST',
                      message: 'Invalid playback progress',
                  },
              },
              400
          );
});

playback.put('/segments', validate('json', SegmentRequestSchema), async (context) => {
    const request = context.req.valid('json');
    if (request.operation === 'set' && !validSkipInterval(request.interval)) {
        return context.json(
            {
                error: {
                    code: 'INVALID_REQUEST',
                    message: 'Invalid segments',
                },
            },
            400
        );
    }
    const saved = await saveEpisodeSegment(request);
    return saved
        ? context.json(saved)
        : context.json(
              {
                  error: {
                      code: 'NOT_FOUND',
                      message: 'Episode not found',
                  },
              },
              404
          );
});
