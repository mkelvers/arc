import { Buffer } from 'node:buffer';

// Single registry of provider CDN hosts. Allowlist membership, request
// referer, and segment handling all derive from it, so a provider CDN is
// described in exactly one place. Hosts match exactly or by `.<host>`
// suffix; `prefix` entries match `hostname.startsWith(host)` instead.
type ProviderHostGroup = {
    hosts: readonly string[];
    referer?: string;
    prefix?: boolean;
    disguisedTs?: boolean;
};

const providerHostGroups: readonly ProviderHostGroup[] = [
    {
        hosts: [
            'tools.fast4speed.rsvp',
            'repackager.wixmp.com',
            'video.wixstatic.com',
            'sharepoint.com',
            'tiktokcdn.com',
        ],
    },
    { hosts: ['mp4upload.com'], referer: 'https://www.mp4upload.com' },
    {
        // Senshi serves MPEG-TS segments disguised as static assets.
        hosts: ['ninstream.com', 'ninjstream.xyz'],
        referer: 'https://senshi.live/',
        disguisedTs: true,
    },
    {
        // MegaPlay serves playlists on watching.onl and rotates its segment
        // CDNs; the family serves MPEG-TS disguised as static assets and
        // demands the MegaPlay referer.
        hosts: [
            'watching.onl',
            'livedns.my',
            'cloudbuzz.lol',
            'sugevideo.xyz',
            'anivideo.sbs',
            'cloudvideo.lat',
            'trycloud.pro',
        ],
        referer: 'https://megaplay.buzz/',
        disguisedTs: true,
    },
    { hosts: ['megap.'], prefix: true, referer: 'https://megaplay.buzz/' },
    { hosts: ['lostproject.club'], referer: 'https://megaplay.buzz/' },
    { hosts: ['animegg.org', 'vidcache.net'], referer: 'https://www.animegg.org/' },
    { hosts: ['vid-cdn.xyz', 'xin-cdn.xyz'], referer: 'https://anizone.to/' },
    { hosts: ['kwik.cx', 'uwucdn.top', 'streampeaker.org'], referer: 'https://kwik.cx/' },
    {
        hosts: ['vibevibe.workers.dev', 'vivibebe.site', 'anizara.store', 'ibyteimg.com'],
        referer: 'https://anineko.to/',
    },
    {
        // AniNeko's StreamHG embeds serve hls4 playlists from otakuhg.site
        // and signed hls2 masters from these rotated CDN roots.
        hosts: ['otakuhg.site', 'premilkyway.com', 'cdn-centaurus.com'],
        referer: 'https://otakuhg.site/',
    },
];

const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
const responseTimeout = 10_000;
const maximumPlaylistSize = 1024 * 1024;
const maximumSubtitleSize = 8 * 1024 * 1024;
const maximumWrappedSegmentSize = 32 * 1024 * 1024;
const resolvedRedirects = new Map<string, { target: URL; expiresAt: number }>();

type StreamFetch = (target: URL, init: RequestInit) => Promise<Response>;
type StreamBody = 'playlist' | 'segment' | 'subtitle';
type StreamProxyFailure =
    | { kind: 'missing-source' }
    | { kind: 'invalid-source' }
    | { kind: 'unsupported-host'; hostname: string }
    | { kind: 'request-timeout' }
    | { kind: 'upstream'; status: number | null }
    | { kind: 'redirect-limit' }
    | { kind: 'unsupported-redirect' }
    | { kind: 'no-response' }
    | { kind: 'invalid-playlist' }
    | { kind: 'body-too-large'; body: StreamBody }
    | { kind: 'body-timeout'; body: StreamBody }
    | { kind: 'body-read'; body: StreamBody };

export class StreamProxyError extends Error {
    constructor(readonly reason: StreamProxyFailure) {
        super(reason.kind);
    }
}

async function providerResponse(target: URL, range: string | null, fetchStream: StreamFetch) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), responseTimeout);

    try {
        return await fetchStream(target, {
            headers: {
                Referer: streamReferer(target),
                'User-Agent': userAgent,
                ...(range ? { Range: range } : {}),
            },
            redirect: 'manual',
            signal: controller.signal,
        });
    } catch {
        if (controller.signal.aborted) {
            throw new StreamProxyError({ kind: 'request-timeout' });
        }
        throw new StreamProxyError({ kind: 'upstream', status: null });
    } finally {
        clearTimeout(timeout);
    }
}

async function proxiedResponse(target: URL, response: Response) {
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

    const contentType = response.headers.get('content-type');
    const playlist =
        target.pathname.toLowerCase().endsWith('.m3u8') ||
        contentType?.toLowerCase().includes('mpegurl');
    if (playlist) {
        headers.set('cache-control', 'no-store');
        headers.set('content-type', 'application/vnd.apple.mpegurl');
        const body = new TextDecoder().decode(
            await boundedResponseBytes(response, maximumPlaylistSize, responseTimeout, 'playlist')
        );

        return new Response(rewriteHlsPlaylist(body, target), {
            status: response.status,
            headers,
        });
    }

    if (target.pathname.toLowerCase().endsWith('.ass')) {
        headers.set('cache-control', 'no-store');
        headers.set('content-type', 'text/vtt; charset=utf-8');
        const body = new TextDecoder().decode(
            await boundedResponseBytes(response, maximumSubtitleSize, responseTimeout, 'subtitle')
        );

        return new Response(assToWebVtt(body), {
            status: response.status,
            headers,
        });
    }

    // ibyteimg and TikTok wrap MPEG-TS segments in a PNG payload.
    if (
        target.hostname.endsWith('.ibyteimg.com') ||
        /^p\d+-ad-site-sign-sg\.tiktokcdn\.com$/.test(target.hostname)
    ) {
        const body = Uint8Array.from(
            unwrapPngSegment(
                await boundedResponseBytes(
                    response,
                    maximumWrappedSegmentSize,
                    responseTimeout,
                    'segment'
                )
            )
        );
        headers.set('content-length', String(body.byteLength));
        headers.set('content-type', 'video/mp2t');

        return new Response(body, {
            status: response.status,
            headers,
        });
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
        headers.set('content-length', contentLength);
    }
    let mediaType =
        !contentType || contentType === 'application/octet-stream' ? 'video/mp4' : contentType;
    if (target.pathname.toLowerCase().endsWith('.vtt')) {
        mediaType = 'text/vtt; charset=utf-8';
    } else if (hostGroup(target.hostname)?.disguisedTs) {
        mediaType = 'video/mp2t';
    }
    headers.set('content-type', mediaType);

    return new Response(response.body, {
        status: response.status,
        headers,
    });
}

function assTime(value: string) {
    const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})[.](\d{2})$/);
    if (!match) {
        return null;
    }

    return `${match[1].padStart(2, '0')}:${match[2]}:${match[3]}.${match[4]}0`;
}

function assToWebVtt(value: string) {
    const lines = value.split(/\r?\n/);
    let events = false;
    let fields: string[] = [];
    const cues: string[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
        if (/^\s*\[Events\]\s*$/i.test(line)) {
            events = true;
            continue;
        }
        if (/^\s*\[/.test(line)) {
            events = false;
            continue;
        }
        if (!events) {
            continue;
        }
        if (/^\s*Format\s*:/i.test(line)) {
            fields = line
                .replace(/^\s*Format\s*:\s*/i, '')
                .split(',')
                .map((field) => field.trim().toLowerCase());
            continue;
        }
        if (!fields.length || !/^\s*Dialogue\s*:/i.test(line)) {
            continue;
        }

        const dialogue = line.replace(/^\s*Dialogue\s*:\s*/i, '');
        const values: string[] = [];
        let offset = 0;
        for (let index = 1; index < fields.length; index += 1) {
            const comma = dialogue.indexOf(',', offset);
            if (comma < 0) {
                break;
            }
            values.push(dialogue.slice(offset, comma));
            offset = comma + 1;
        }
        values.push(dialogue.slice(offset));
        if (values.length !== fields.length || fields.at(-1) !== 'text') {
            continue;
        }
        const start = assTime(values[fields.indexOf('start')] ?? '');
        const end = assTime(values[fields.indexOf('end')] ?? '');
        const effect = values[fields.indexOf('effect')]?.trim() ?? '';
        const text = (values[fields.indexOf('text')] ?? '')
            .replace(/\{[^}]*\}/g, '')
            .replace(/\\[Nn]/g, '\n')
            .replace(/\\h/g, ' ')
            .trim();
        const key = `${start}\n${end}\n${text}`;
        if (start && end && text && !effect && !seen.has(key)) {
            seen.add(key);
            cues.push(`${start} --> ${end}\n${text}`);
        }
    }

    return `WEBVTT\n\n${cues.join('\n\n')}${cues.length ? '\n' : ''}`;
}

async function followProviderRedirects(
    initialTarget: URL,
    range: string | null,
    fetchStream: StreamFetch
) {
    let target = initialTarget;

    for (let redirects = 0; redirects <= 3; redirects += 1) {
        const response = await providerResponse(target, range, fetchStream);
        const location = response.headers.get('location');

        if (response.status < 300 || response.status >= 400 || !location) {
            if (!response.ok && response.status !== 206) {
                const status =
                    response.status >= 400 && response.status <= 599 ? response.status : 502;
                throw new StreamProxyError({ kind: 'upstream', status });
            }
            return { response, target };
        }
        if (redirects === 3) {
            throw new StreamProxyError({ kind: 'redirect-limit' });
        }

        try {
            target = streamTarget(new URL(location, target).toString());
        } catch {
            throw new StreamProxyError({ kind: 'unsupported-redirect' });
        }
    }

    throw new StreamProxyError({ kind: 'no-response' });
}

async function providerMediaResponse(
    initialTarget: URL,
    range: string | null,
    fetchStream: StreamFetch
) {
    const key = initialTarget.toString();
    const cached = resolvedRedirects.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        try {
            return await followProviderRedirects(cached.target, range, fetchStream);
        } catch {
            resolvedRedirects.delete(key);
        }
    } else if (cached) {
        resolvedRedirects.delete(key);
    }

    const provider = await followProviderRedirects(initialTarget, range, fetchStream);
    if (provider.target.toString() !== key) {
        const now = Date.now();
        for (const [source, redirect] of resolvedRedirects) {
            if (redirect.expiresAt <= now) {
                resolvedRedirects.delete(source);
            }
        }
        if (resolvedRedirects.size >= 512) {
            resolvedRedirects.delete(resolvedRedirects.keys().next().value ?? '');
        }
        resolvedRedirects.set(key, { target: provider.target, expiresAt: now + 5 * 60_000 });
    }

    return provider;
}

export async function proxyStreamRequest(request: Request, fetchStream: StreamFetch) {
    const url = new URL(request.url);
    const encoded = url.searchParams.get('src');
    let source = url.searchParams.get('url');
    if (encoded) {
        try {
            source = Buffer.from(encoded, 'base64url').toString('utf8');
        } catch {
            source = null;
        }
    }

    const target = streamTarget(source);
    const provider = await providerMediaResponse(target, request.headers.get('range'), fetchStream);
    return proxiedResponse(provider.target, provider.response);
}

/** Reject provider sources that expose a playlist but cannot serve its first
 * media segment. This keeps expired signed playlists out of the browser's
 * fallback order. */
export async function verifyStreamSource(source: string, fetchStream: StreamFetch = fetch) {
    let provider = await followProviderRedirects(streamTarget(source), null, fetchStream);

    for (let depth = 0; depth < 3; depth += 1) {
        const contentType = provider.response.headers.get('content-type')?.toLowerCase();
        const playlist =
            provider.target.pathname.toLowerCase().endsWith('.m3u8') ||
            contentType?.includes('mpegurl');
        if (!playlist) {
            await provider.response.body?.cancel().catch(() => undefined);
            return;
        }

        const body = new TextDecoder().decode(
            await boundedResponseBytes(
                provider.response,
                maximumPlaylistSize,
                responseTimeout,
                'playlist'
            )
        );
        const reference = firstHlsReference(body);
        if (!reference) {
            throw new StreamProxyError({ kind: 'invalid-playlist' });
        }

        const target = streamTarget(new URL(reference.url, provider.target).toString());
        if (reference.kind === 'segment') {
            const segment = await followProviderRedirects(target, 'bytes=0-0', fetchStream);
            await segment.response.body?.cancel().catch(() => undefined);
            return;
        }

        provider = await followProviderRedirects(target, null, fetchStream);
    }

    throw new StreamProxyError({ kind: 'invalid-playlist' });
}

async function boundedResponseBytes(
    response: Response,
    maximumBytes: number,
    timeoutMs: number,
    bodyKind: StreamBody
) {
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
        throw new StreamProxyError({ kind: 'body-too-large', body: bodyKind });
    }
    if (!response.body) {
        return new Uint8Array();
    }

    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    const deadline = Date.now() + timeoutMs;
    let length = 0;

    while (true) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            await reader.cancel().catch(() => undefined);
            throw new StreamProxyError({ kind: 'body-timeout', body: bodyKind });
        }

        let timeout: ReturnType<typeof setTimeout> | undefined;
        const expired = new Promise<never>((_, reject) => {
            timeout = setTimeout(
                () => reject(new StreamProxyError({ kind: 'body-timeout', body: bodyKind })),
                remaining
            );
        });
        let result: Awaited<ReturnType<typeof reader.read>>;

        try {
            result = await Promise.race([reader.read(), expired]);
        } catch (cause) {
            await reader.cancel().catch(() => undefined);
            throw cause instanceof StreamProxyError
                ? cause
                : new StreamProxyError({ kind: 'body-read', body: bodyKind });
        } finally {
            clearTimeout(timeout);
        }

        if (result.done) {
            break;
        }

        length += result.value.byteLength;
        if (length > maximumBytes) {
            await reader.cancel().catch(() => undefined);
            throw new StreamProxyError({ kind: 'body-too-large', body: bodyKind });
        }
        parts.push(result.value);
    }

    const body = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        body.set(part, offset);
        offset += part.byteLength;
    }

    return body;
}

function hostGroup(hostname: string) {
    return providerHostGroups.find((group) =>
        group.hosts.some((host) =>
            group.prefix
                ? hostname.startsWith(host)
                : hostname === host || hostname.endsWith(`.${host}`)
        )
    );
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

    if (target.protocol !== 'https:' || !hostGroup(target.hostname)) {
        throw new StreamProxyError({ kind: 'unsupported-host', hostname: target.hostname });
    }

    return target;
}

function streamReferer(target: URL) {
    return hostGroup(target.hostname)?.referer ?? 'https://youtu-chan.com';
}

function rewrittenReference(reference: string, playlist: URL, warnedHosts: Set<string>) {
    if (reference.startsWith('data:')) {
        return reference;
    }

    let target: URL;
    try {
        target = new URL(reference, playlist);
    } catch {
        return reference;
    }

    try {
        const allowedTarget = streamTarget(target.toString());
        return `/api/episodes/stream?${new URLSearchParams({
            src: Buffer.from(allowedTarget.toString()).toString('base64url'),
        })}`;
    } catch (cause) {
        if (!(cause instanceof StreamProxyError)) {
            throw cause;
        }

        // The proxy only serves allowlisted hosts. Keep the original
        // reference so the browser can still fetch it directly, and
        // surface the gap so a legitimate provider CDN can be allowed.
        if (!warnedHosts.has(target.hostname)) {
            warnedHosts.add(target.hostname);
            console.warn(
                `Stream proxy skipped unlisted host ${target.hostname} referenced by ${playlist.hostname}`
            );
        }
        return reference;
    }
}

function firstHlsReference(value: string) {
    const lines = value.split(/\r?\n/).map((line) => line.trim());
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.startsWith('#EXTINF:') && !line.startsWith('#EXT-X-STREAM-INF:')) {
            continue;
        }

        const url = lines
            .slice(index + 1)
            .find((candidate) => candidate && !candidate.startsWith('#'));
        if (url) {
            return {
                kind: line.startsWith('#EXTINF:') ? ('segment' as const) : ('variant' as const),
                url,
            };
        }
    }

    return null;
}

function rewriteHlsPlaylist(value: string, playlist: URL) {
    const warnedHosts = new Set<string>();
    return value
        .split(/\r?\n/)
        .map((line) => {
            if (!line || line.startsWith('#')) {
                return line.replace(
                    /URI=(["'])(.*?)\1/g,
                    (_, quote: string, uri: string) =>
                        `URI=${quote}${rewrittenReference(uri, playlist, warnedHosts)}${quote}`
                );
            }

            return rewrittenReference(line.trim(), playlist, warnedHosts);
        })
        .join('\n');
}

const pngEnd = new Uint8Array([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

function unwrapPngSegment(value: Uint8Array) {
    for (let index = 0; index <= value.length - pngEnd.length; index++) {
        if (pngEnd.every((byte, offset) => value[index + offset] === byte)) {
            return value.slice(index + pngEnd.length);
        }
    }

    return value;
}
