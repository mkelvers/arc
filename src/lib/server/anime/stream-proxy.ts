import { Buffer } from 'node:buffer';

const allowedHosts = [
  'tools.fast4speed.rsvp',
  'repackager.wixmp.com',
  'video.wixstatic.com',
  'mp4upload.com',
  'sharepoint.com',
  'hls.anidb.app',
  'ninstream.com',
  'ninjstream.xyz',
  'ibyteimg.com',
  'vibevibe.workers.dev',
  'vivibebe.site',
  'lostproject.club',
  'anizara.store',
  'kwik.cx',
  'uwucdn.top',
  'streampeaker.org',
];
const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
const responseTimeout = 10_000;
const maximumPlaylistSize = 1024 * 1024;
const maximumWrappedSegmentSize = 32 * 1024 * 1024;
const refererHostGroups = [
  { hosts: ['mp4upload.com'], referer: 'https://www.mp4upload.com' },
  { hosts: ['ninstream.com', 'ninjstream.xyz'], referer: 'https://senshi.live/' },
  { hosts: ['kwik.cx', 'uwucdn.top', 'streampeaker.org'], referer: 'https://kwik.cx/' },
] as const;

type StreamFetch = (target: URL, init: RequestInit) => Promise<Response>;

export class StreamProxyError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

class StreamTargetError extends StreamProxyError {
  constructor(message: string, status: 400 | 403) {
    super(message, status);
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
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new StreamProxyError('Episode stream timed out', 504);
    }
    console.warn(
      `Episode stream request failed for ${target.hostname}: ${cause instanceof Error ? cause.message : String(cause)}`
    );
    throw new StreamProxyError('Episode stream failed', 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function proxiedResponse(target: URL, response: Response) {
  const headers = new Headers();
  for (const name of ['accept-ranges', 'cache-control', 'content-range', 'etag', 'last-modified']) {
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
      await boundedResponseBytes(response, maximumPlaylistSize, responseTimeout, 'Episode playlist')
    );

    return new Response(rewriteHlsPlaylist(body, target), {
      status: response.status,
      headers,
    });
  }

  if (target.hostname.endsWith('.ibyteimg.com')) {
    const body = Uint8Array.from(
      unwrapPngSegment(
        await boundedResponseBytes(
          response,
          maximumWrappedSegmentSize,
          responseTimeout,
          'Episode segment'
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
  } else if (
    target.hostname.endsWith('ninstream.com') &&
    /\.(?:jpe?g|png)$/i.test(target.pathname)
  ) {
    mediaType = 'video/mp2t';
  }
  headers.set('content-type', mediaType);

  return new Response(response.body, {
    status: response.status,
    headers,
  });
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
        const status = response.status >= 400 && response.status <= 599 ? response.status : 502;
        throw new StreamProxyError('Episode stream failed', status);
      }
      return { response, target };
    }
    if (redirects === 3) {
      throw new StreamProxyError('Episode stream redirected too many times', 502);
    }

    try {
      target = streamTarget(new URL(location, target).toString());
    } catch {
      throw new StreamProxyError('Episode stream redirected to an unsupported host', 502);
    }
  }

  throw new StreamProxyError('Episode stream did not respond', 502);
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
  const provider = await followProviderRedirects(target, request.headers.get('range'), fetchStream);
  return proxiedResponse(provider.target, provider.response);
}

async function boundedResponseBytes(
  response: Response,
  maximumBytes: number,
  timeoutMs: number,
  label: string
) {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new StreamProxyError(`${label} was unexpectedly large`, 502);
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
      throw new StreamProxyError(`${label} timed out`, 504);
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new StreamProxyError(`${label} timed out`, 504)),
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
        : new StreamProxyError(`${label} could not be read`, 502);
    } finally {
      clearTimeout(timeout);
    }

    if (result.done) {
      break;
    }

    length += result.value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new StreamProxyError(`${label} was unexpectedly large`, 502);
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

function allowedHost(hostname: string) {
  // MegaPlay rotates per-series CDN hosts that all share the `megap.`
  // prefix; the rest of the list is exact-or-`.<host>` suffix matched.
  return hostname.startsWith('megap.') || matchesHost(hostname, allowedHosts);
}

function matchesHost(hostname: string, hosts: readonly string[]) {
  return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

function streamTarget(value: string | null) {
  if (!value) {
    throw new StreamTargetError('Missing stream URL', 400);
  }

  let target: URL;
  try {
    target = new URL(value);
  } catch {
    throw new StreamTargetError('Invalid stream URL', 400);
  }

  if (target.protocol !== 'https:' || !allowedHost(target.hostname)) {
    throw new StreamTargetError(`Unsupported stream host: ${target.hostname}`, 403);
  }

  return target;
}

function streamReferer(target: URL) {
  const hostname = target.hostname;
  const group = refererHostGroups.find(({ hosts }) => matchesHost(hostname, hosts));
  if (group) {
    return group.referer;
  }
  if (hostname === 'hls.anidb.app') {
    return 'https://anidb.app/';
  }
  if (hostname.startsWith('megap.') || hostname.endsWith('.lostproject.club')) {
    return 'https://megaplay.buzz/';
  }
  if (
    hostname === 'vivibebe.site' ||
    hostname.endsWith('.vibevibe.workers.dev') ||
    hostname.endsWith('.anizara.store') ||
    hostname.endsWith('.ibyteimg.com')
  ) {
    return 'https://anineko.to/';
  }

  return 'https://youtu-chan.com';
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
    return `/api/watch/stream?${new URLSearchParams({
      src: Buffer.from(allowedTarget.toString()).toString('base64url'),
    })}`;
  } catch (cause) {
    if (!(cause instanceof StreamTargetError)) {
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
