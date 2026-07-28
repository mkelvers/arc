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
    'megap.kotocdn.site',
    'ibyteimg.com',
    'vibevibe.workers.dev',
    'vivibebe.site',
    'lostproject.club',
    'anizara.store',
    'kwik.cx',
    'uwucdn.top',
    'streampeaker.org',
];

export class StreamTargetError extends Error {
    constructor(
        message: string,
        readonly status: 400 | 403,
    ) {
        super(message);
    }
}

function allowedHost(hostname: string) {
    return allowedHosts.some(
        (host) =>
            hostname === host || hostname.endsWith(`.${host}`),
    );
}

export function streamTarget(value: string | null) {
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
        throw new StreamTargetError('Unsupported stream host', 403);
    }

    return target;
}

export function streamReferer(target: URL) {
    if (
        target.hostname === 'mp4upload.com' ||
        target.hostname.endsWith('.mp4upload.com')
    ) {
        return 'https://www.mp4upload.com';
    }
    if (
        target.hostname === 'ninstream.com' ||
        target.hostname.endsWith('.ninstream.com') ||
        target.hostname === 'ninjstream.xyz' ||
        target.hostname.endsWith('.ninjstream.xyz')
    ) {
        return 'https://senshi.live/';
    }
    if (target.hostname === 'hls.anidb.app') {
        return 'https://anidb.app/';
    }
    if (
        target.hostname === 'megap.kotocdn.site' ||
        target.hostname.endsWith('.lostproject.club')
    ) {
        return 'https://megaplay.buzz/';
    }
    if (
        target.hostname === 'vivibebe.site' ||
        target.hostname.endsWith('.vibevibe.workers.dev') ||
        target.hostname.endsWith('.anizara.store') ||
        target.hostname.endsWith('.ibyteimg.com')
    ) {
        return 'https://anineko.to/';
    }
    if (
        target.hostname === 'kwik.cx' ||
        target.hostname.endsWith('.kwik.cx') ||
        target.hostname === 'uwucdn.top' ||
        target.hostname.endsWith('.uwucdn.top') ||
        target.hostname === 'streampeaker.org' ||
        target.hostname.endsWith('.streampeaker.org')
    ) {
        return 'https://kwik.cx/';
    }

    return 'https://youtu-chan.com';
}

export function proxiedStreamUrl(target: URL) {
    return `/api/watch/stream?${new URLSearchParams({
        src: Buffer.from(target.toString()).toString('base64url'),
    })}`;
}

export function streamTargetParameter(url: URL) {
    const encoded = url.searchParams.get('src');
    if (!encoded) {
        return url.searchParams.get('url');
    }

    try {
        return Buffer.from(encoded, 'base64url').toString('utf8');
    } catch {
        return null;
    }
}

function rewrittenReference(reference: string, playlist: URL) {
    if (reference.startsWith('data:')) {
        return reference;
    }

    return proxiedStreamUrl(
        streamTarget(new URL(reference, playlist).toString()),
    );
}

export function rewriteHlsPlaylist(value: string, playlist: URL) {
    return value
        .split(/\r?\n/)
        .map((line) => {
            if (!line || line.startsWith('#')) {
                return line.replace(
                    /URI=(["'])(.*?)\1/g,
                    (_, quote: string, uri: string) =>
                        `URI=${quote}${rewrittenReference(uri, playlist)}${quote}`,
                );
            }

            return rewrittenReference(line.trim(), playlist);
        })
        .join('\n');
}

const pngEnd = new Uint8Array([
    0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

export function unwrapPngSegment(value: Uint8Array) {
    for (
        let index = 0;
        index <= value.length - pngEnd.length;
        index++
    ) {
        if (
            pngEnd.every(
                (byte, offset) => value[index + offset] === byte,
            )
        ) {
            return value.slice(index + pngEnd.length);
        }
    }

    return value;
}
