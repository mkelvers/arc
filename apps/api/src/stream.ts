import { Buffer } from 'node:buffer';

import {
    aniKotoRequestTimeoutMs,
    aniKotoMediaReferer,
    aniKotoStreamLimits,
    isAniKotoDisguisedSegmentHost,
    normalizeAniKotoMediaUrl,
    unwrapAniKotoDisguisedSegment,
} from '@arc/backend/internal/anime/providers/anikoto';

const upstreamReferer = aniKotoMediaReferer;

type StreamFetch = (target: URL, init: RequestInit) => Promise<Response>;
type StreamBody = 'playlist' | 'segment' | 'subtitle';

type StreamProxyFailure =
    | { kind: 'missing-source' }
    | { kind: 'invalid-source' }
    | { kind: 'unsupported-host' }
    | { kind: 'upstream'; status: number | null }
    | { kind: 'redirect-limit' }
    | { kind: 'unsupported-redirect' }
    | { kind: 'invalid-playlist' }
    | { kind: 'invalid-segment' }
    | { kind: 'body-too-large'; body: StreamBody }
    | { kind: 'body-timeout'; body: StreamBody };

export class StreamProxyError extends Error {
    constructor(readonly reason: StreamProxyFailure) {
        super(reason.kind);
    }
}

function streamTarget(value: string | null) {
    if (!value) {
        throw new StreamProxyError({ kind: 'missing-source' });
    }

    let target: URL;
    try {
        target = new URL(value);
    } catch {
        throw new StreamProxyError({ kind: 'invalid-source' });
    }

    const normalized = normalizeAniKotoMediaUrl(target);
    if (!normalized) {
        throw new StreamProxyError({ kind: 'unsupported-host' });
    }

    return normalized;
}

async function upstreamResponse(target: URL, range: string | null, fetchStream: StreamFetch) {
    const headers = new Headers({
        Accept: '*/*',
        Referer: upstreamReferer,
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
    });
    if (range) {
        headers.set('Range', range);
    }

    try {
        return await fetchStream(target, {
            headers,
            redirect: 'manual',
            signal: AbortSignal.timeout(aniKotoRequestTimeoutMs),
        });
    } catch {
        throw new StreamProxyError({ kind: 'upstream', status: null });
    }
}

async function fetchProviderResource(
    initialTarget: URL,
    range: string | null,
    fetchStream: StreamFetch
) {
    let target = initialTarget;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
        const response = await upstreamResponse(target, range, fetchStream);
        if (response.status < 300 || response.status >= 400) {
            if (!response.ok && response.status !== 206) {
                throw new StreamProxyError({ kind: 'upstream', status: response.status });
            }
            return { response, target };
        }

        const location = response.headers.get('location');
        if (!location || redirects === 3) {
            throw new StreamProxyError({ kind: 'redirect-limit' });
        }

        try {
            target = streamTarget(new URL(location, target).toString());
        } catch (cause) {
            if (cause instanceof StreamProxyError && cause.reason.kind === 'unsupported-host') {
                throw new StreamProxyError({ kind: 'unsupported-redirect' });
            }
            throw cause;
        }
    }

    throw new StreamProxyError({ kind: 'redirect-limit' });
}

async function boundedBytes(response: Response, maximumBytes: number, body: StreamBody) {
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
        throw new StreamProxyError({ kind: 'body-too-large', body });
    }
    if (!response.body) {
        return new Uint8Array();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const timeout = new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new StreamProxyError({ kind: 'body-timeout', body })),
                    aniKotoRequestTimeoutMs
                );
            });
            let result: Awaited<ReturnType<typeof reader.read>>;
            try {
                result = await Promise.race([reader.read(), timeout]);
            } catch (cause) {
                await reader.cancel().catch(() => undefined);
                throw cause;
            } finally {
                clearTimeout(timer);
            }

            if (result.done) {
                break;
            }
            size += result.value.byteLength;
            if (size > maximumBytes) {
                await reader.cancel();
                throw new StreamProxyError({ kind: 'body-too-large', body });
            }
            chunks.push(result.value);
        }
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

async function boundedText(response: Response, maximumBytes: number, body: StreamBody) {
    return new TextDecoder().decode(await boundedBytes(response, maximumBytes, body));
}

function proxyReference(reference: string, playlist: URL) {
    if (reference.startsWith('data:')) {
        return reference;
    }

    let target: URL;
    try {
        target = streamTarget(new URL(reference, playlist).toString());
    } catch {
        throw new StreamProxyError({ kind: 'unsupported-host' });
    }

    return `/v1/stream?${new URLSearchParams({
        src: Buffer.from(target.toString()).toString('base64url'),
    })}`;
}

function rewritePlaylist(value: string, playlist: URL) {
    return value
        .split(/\r?\n/)
        .map((line) => {
            if (!line || !line.startsWith('#')) {
                return line ? proxyReference(line.trim(), playlist) : line;
            }

            return line.replace(
                /URI=(['"])(.*?)\1/g,
                (_, quote: string, reference: string) =>
                    `URI=${quote}${proxyReference(reference, playlist)}${quote}`
            );
        })
        .join('\n');
}

function responseHeaders(response: Response) {
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
    return headers;
}

async function proxiedResponse(target: URL, response: Response) {
    const headers = responseHeaders(response);
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    const isPlaylist = target.pathname.endsWith('.m3u8') || contentType.includes('mpegurl');
    if (isPlaylist) {
        headers.set('Cache-Control', 'no-store');
        headers.set('Content-Type', 'application/vnd.apple.mpegurl');
        const body = await boundedText(response, aniKotoStreamLimits.playlist, 'playlist');
        if (!/^\s*#EXTM3U(?:\s|$)/.test(body)) {
            throw new StreamProxyError({ kind: 'invalid-playlist' });
        }
        return new Response(rewritePlaylist(body, target), {
            status: response.status,
            headers,
        });
    }

    if (target.pathname.endsWith('.vtt')) {
        headers.set('Cache-Control', 'no-store');
        headers.set('Content-Type', 'text/vtt; charset=utf-8');
        const body = await boundedText(response, aniKotoStreamLimits.subtitle, 'subtitle');
        return new Response(body, { status: response.status, headers });
    }

    const isDisguisedSegment =
        isAniKotoDisguisedSegmentHost(target.hostname) ||
        /\.(?:png|jpe?g)$/i.test(target.pathname) ||
        contentType.startsWith('image/');
    if (isDisguisedSegment) {
        const body = await boundedBytes(response, aniKotoStreamLimits.segment, 'segment');
        const unwrapped = unwrapAniKotoDisguisedSegment(body);
        if (unwrapped[0] !== 0x47) {
            throw new StreamProxyError({ kind: 'invalid-segment' });
        }
        headers.set('Content-Type', 'video/mp2t');
        headers.set('Content-Length', String(unwrapped.byteLength));
        return new Response(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(unwrapped);
                    controller.close();
                },
            }),
            { status: response.status, headers }
        );
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > aniKotoStreamLimits.segment) {
        throw new StreamProxyError({ kind: 'body-too-large', body: 'segment' });
    }
    headers.set('Content-Type', response.headers.get('content-type') ?? 'application/octet-stream');
    const length = response.headers.get('content-length');
    if (length) {
        headers.set('Content-Length', length);
    }
    return new Response(response.body, { status: response.status, headers });
}

export async function proxyStreamRequest(request: Request, fetchStream: StreamFetch) {
    const url = new URL(request.url);
    const encoded = url.searchParams.get('src');
    if (!encoded || encoded.length > 4096) {
        throw new StreamProxyError({ kind: 'missing-source' });
    }

    let source: string;
    try {
        source = Buffer.from(encoded, 'base64url').toString('utf8');
    } catch {
        throw new StreamProxyError({ kind: 'invalid-source' });
    }

    const target = streamTarget(source);
    const { response, target: resolvedTarget } = await fetchProviderResource(
        target,
        request.headers.get('range'),
        fetchStream
    );
    return proxiedResponse(resolvedTarget, response);
}
