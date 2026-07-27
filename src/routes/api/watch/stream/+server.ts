import { error, type RequestHandler } from '@sveltejs/kit';

import {
    rewriteHlsPlaylist,
    streamReferer,
    streamTarget,
    streamTargetParameter,
    StreamTargetError,
    unwrapPngSegment,
} from '$lib/server/anime/stream-proxy';

const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';

function source(value: string | null) {
    try {
        return streamTarget(value);
    } catch (cause) {
        if (cause instanceof StreamTargetError) {
            error(cause.status, cause.message);
        }
        throw cause;
    }
}

export const GET: RequestHandler = async ({ request, url, fetch }) => {
    let target = source(streamTargetParameter(url));
    const range = request.headers.get('range');
    let response: Response | null = null;

    for (let redirects = 0; redirects <= 3; redirects++) {
        response = await fetch(target, {
            headers: {
                Referer: streamReferer(target),
                'User-Agent': userAgent,
                ...(range ? { Range: range } : {}),
            },
            redirect: 'manual',
        });
        const location = response.headers.get('location');

        if (
            response.status < 300 ||
            response.status >= 400 ||
            !location
        ) {
            break;
        }

        if (redirects === 3) {
            error(502, 'Episode stream redirected too many times');
        }

        try {
            target = streamTarget(
                new URL(location, target).toString(),
            );
        } catch {
            error(502, 'Episode stream redirected to an unsupported host');
        }
    }

    if (!response) {
        error(502, 'Episode stream did not respond');
    }
    if (!response.ok && response.status !== 206) {
        error(response.status, 'Episode stream failed');
    }

    const contentType = response.headers.get('content-type');
    const playlist =
        target.pathname.toLowerCase().endsWith('.m3u8') ||
        contentType?.toLowerCase().includes('mpegurl');
    const headers = new Headers();
    for (const name of [
        'accept-ranges',
        'cache-control',
        'content-range',
        'etag',
        'last-modified',
    ]) {
        const value = response.headers.get(name);
        if (value) {
            headers.set(name, value);
        }
    }

    if (playlist) {
        headers.set('cache-control', 'no-store');
        headers.set('content-type', 'application/vnd.apple.mpegurl');
        return new Response(
            rewriteHlsPlaylist(await response.text(), target),
            {
                status: response.status,
                headers,
            },
        );
    }

    if (target.hostname.endsWith('.ibyteimg.com')) {
        const body = Uint8Array.from(
            unwrapPngSegment(
                new Uint8Array(await response.arrayBuffer()),
            ),
        );
        headers.set('content-length', String(body.byteLength));
        headers.set('content-type', 'video/mp2t');
        return new Response(body.buffer, {
            status: response.status,
            headers,
        });
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
        headers.set('content-length', contentLength);
    }
    const subtitle = target.pathname.toLowerCase().endsWith('.vtt');
    const transportStream =
        target.hostname.endsWith('ninstream.com') &&
        /\.(?:jpe?g|png)$/i.test(target.pathname);
    headers.set(
        'content-type',
        subtitle
            ? 'text/vtt; charset=utf-8'
            : transportStream
              ? 'video/mp2t'
              : !contentType ||
                  contentType === 'application/octet-stream'
                ? 'video/mp4'
                : contentType,
    );

    return new Response(response.body, {
        status: response.status,
        headers,
    });
};
