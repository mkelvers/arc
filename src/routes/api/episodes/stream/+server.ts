import { error, type RequestHandler } from '@sveltejs/kit';

import { proxyStreamRequest, StreamProxyError } from '$lib/server/anime/stream-proxy';

export const GET: RequestHandler = async ({ request, fetch }) => {
    try {
        return await proxyStreamRequest(request, fetch);
    } catch (cause) {
        if (!(cause instanceof StreamProxyError)) {
            throw cause;
        }

        const reason = cause.reason;
        switch (reason.kind) {
            case 'missing-source':
                error(400, 'Missing stream URL');
            case 'invalid-source':
                error(400, 'Invalid stream URL');
            case 'unsupported-host':
                error(403, `Unsupported stream host: ${reason.hostname}`);
            case 'request-timeout':
                error(504, 'Episode stream timed out');
            case 'upstream':
                error(reason.status ?? 502, 'Episode stream failed');
            case 'redirect-limit':
                error(502, 'Episode stream redirected too many times');
            case 'unsupported-redirect':
                error(502, 'Episode stream redirected to an unsupported host');
            case 'no-response':
                error(502, 'Episode stream did not respond');
            case 'invalid-playlist':
                error(502, 'Episode playlist did not contain playable media');
            case 'body-too-large':
            case 'body-timeout':
            case 'body-read': {
                const label =
                    reason.body === 'playlist'
                        ? 'Episode playlist'
                        : reason.body === 'subtitle'
                          ? 'Episode subtitle'
                          : 'Episode segment';
                if (reason.kind === 'body-too-large') {
                    error(502, `${label} was unexpectedly large`);
                }
                if (reason.kind === 'body-timeout') {
                    error(504, `${label} timed out`);
                }
                error(502, `${label} could not be read`);
            }
            default:
                reason satisfies never;
                throw cause;
        }
    }
};
