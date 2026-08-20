import { record } from '$lib/utils';
import type { JsonValue } from '$lib/utils';
import { z } from 'zod';
import { referer, userAgent } from './client';
import type { Source, Stream } from './types';

interface MediaReference {
    url: string;
    quality: string | null;
}
const sourceSchema = z.object({ sourceName: z.string(), sourceUrl: z.string() });
const qualityValue = z.union([z.string(), z.number()]);

export function sourceReferences(value: JsonValue): Source[] {
    const root = record(value);
    const data = record(root?.data) ?? root;
    const episode = record(data?.episode) ?? data;
    const urls = episode?.sourceUrls;

    if (!Array.isArray(urls)) {
        return [];
    }

    return urls.flatMap((value) => {
        const source = record(value);
        const parsed = sourceSchema.safeParse(source);

        return parsed.success ? [{ name: parsed.data.sourceName, url: parsed.data.sourceUrl }] : [];
    });
}

const substitutions = new Map(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~:/?#[]@!$&()*+,;=%'
        .split('')
        .map((character) => [
            (character.charCodeAt(0) ^ 0x38).toString(16).padStart(2, '0'),
            character,
        ])
);

export function decodeSourceUrl(value: string) {
    if (!value.startsWith('--')) {
        return value;
    }

    const encoded = value.slice(2);
    let decoded = '';

    for (let index = 0; index < encoded.length; index += 2) {
        const pair = encoded.slice(index, index + 2);
        decoded += substitutions.get(pair) ?? pair;
    }

    return decoded.replace('/clock', '/clock.json');
}

function streamQuality(value: JsonValue | undefined) {
    const parsed = qualityValue.safeParse(value);
    const normalized = parsed.success ? String(parsed.data) : '';
    const match = normalized.match(/^(\d{3,4})p?$/i);
    return match ? `${Number(match[1])}p` : null;
}

function mediaReferences(
    value: JsonValue,
    inheritedQuality: string | null = null
): MediaReference[] {
    const text = z.string().safeParse(value);
    if (text.success) {
        return /^https?:\/\//.test(text.data)
            ? [{ url: text.data, quality: inheritedQuality }]
            : [];
    }

    if (Array.isArray(value)) {
        return value.flatMap((child) => mediaReferences(child, inheritedQuality));
    }

    const object = record(value);
    if (!object) {
        return [];
    }

    const quality =
        streamQuality(object.resolutionStr) ??
        streamQuality(object.resolution) ??
        streamQuality(object.quality) ??
        inheritedQuality;

    return Object.entries(object).flatMap(([key, child]) => {
        if (['link', 'url', 'file', 'src'].includes(key.toLowerCase())) {
            return mediaReferences(child, quality);
        }

        const parsed = z.json().safeParse(child);
        return parsed.success ? mediaReferences(parsed.data, quality) : [];
    });
}

function wixStreams(target: string): Stream[] {
    const match = target.match(
        /^https:\/\/repackager\.wixmp\.com\/(video\.wixstatic\.com\/.+?)\/,([^/]+),\/(.+?)\.urlset(?:\/.*)?$/
    );
    if (!match) {
        return [];
    }

    return match[2].split(',').flatMap((value) => {
        const quality = streamQuality(value);

        return quality
            ? [
                  {
                      url: `https://${match[1]}/${quality}/${match[3]}`,
                      quality,
                  },
              ]
            : [];
    });
}

export async function resolveTarget(
    target: string,
    quality: string | null = null,
    depth = 0
): Promise<Stream[]> {
    if (depth > 4) {
        return [];
    }

    const wix = wixStreams(target);
    if (wix.length) {
        return wix;
    }

    const url = new URL(target);
    const host = url.hostname.toLowerCase();
    const direct = host === 'tools.fast4speed.rsvp' || host.endsWith('.sharepoint.com');

    if (direct || /\.(?:m3u8|mp4)(?:[?#]|$)/i.test(url.pathname)) {
        const pathQuality = url.pathname.match(/(?:^|\/)(\d{3,4})p(?:\/|$)/i)?.[1];

        return [
            {
                url: url.toString(),
                quality: quality ?? streamQuality(pathQuality),
            },
        ];
    }

    const response = await fetch(target, {
        headers: { Referer: referer, 'User-Agent': userAgent },
        signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
        throw new Error(`AllAnime source endpoint returned ${response.status}`);
    }

    if (/mpegurl|vnd\.apple\.mpegurl/i.test(response.headers.get('content-type') ?? '')) {
        return [{ url: target, quality }];
    }

    const text = await response.text();

    if (/^\s*#EXTM3U\b/i.test(text)) {
        return [{ url: target, quality }];
    }

    try {
        const references = mediaReferences(JSON.parse(text), quality).filter(
            ({ url }) => url !== target
        );
        const streams = await Promise.all(
            references.map((reference) =>
                resolveTarget(reference.url, reference.quality, depth + 1)
            )
        );

        return streams.flat();
    } catch {
        const embedded = text.match(/src:\s*["']([^"']+)["']/)?.[1];

        return embedded
            ? resolveTarget(new URL(embedded, target).toString(), quality, depth + 1)
            : [];
    }
}
