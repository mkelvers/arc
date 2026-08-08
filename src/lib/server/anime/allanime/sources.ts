import { audioDelayFromMp4 } from '$lib/server/anime/mp4';
import { record } from '$lib/utils';
import { referer, userAgent } from './client';
import type { Source, Stream } from './types';

interface MediaReference {
  url: string;
  quality: string | null;
}

export function sourceReferences(value: unknown): Source[] {
  const root = record(value);
  const data = record(root?.data) ?? root;
  const episode = record(data?.episode) ?? data;
  const urls = episode?.sourceUrls;

  if (!Array.isArray(urls)) {
    return [];
  }

  return urls.flatMap((value) => {
    const source = record(value);
    const name = source?.sourceName;
    const url = source?.sourceUrl;

    return typeof name === 'string' && typeof url === 'string' ? [{ name, url }] : [];
  });
}

const substitutions = new Map(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~:/?#[]@!$&()*+,;=%'
    .split('')
    .map((character) => [(character.charCodeAt(0) ^ 0x38).toString(16).padStart(2, '0'), character])
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

async function responsePrefix(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) {
    return new Uint8Array();
  }

  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    while (length < limit) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const remaining = limit - length;
      const chunk = value.length > remaining ? value.subarray(0, remaining) : value;
      chunks.push(chunk);
      length += chunk.length;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const result = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

export async function detectAudioDelay(target: string) {
  const host = new URL(target).hostname;
  const response = await fetch(target, {
    headers: {
      Range: 'bytes=0-2097151',
      Referer: host.endsWith('.mp4upload.com') ? 'https://www.mp4upload.com' : referer,
      'User-Agent': userAgent,
    },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok && response.status !== 206) {
    return 0;
  }

  return audioDelayFromMp4(await responsePrefix(response, 2_097_152));
}

function streamQuality(value: unknown) {
  const normalized = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const match = normalized.match(/^(\d{3,4})p?$/i);
  return match ? `${Number(match[1])}p` : null;
}

function mediaReferences(value: unknown, inheritedQuality: string | null = null): MediaReference[] {
  if (typeof value === 'string') {
    return /^https?:\/\//.test(value) ? [{ url: value, quality: inheritedQuality }] : [];
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

    return typeof child === 'object' ? mediaReferences(child, quality) : [];
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
            audioDelay: 0,
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

  if (direct || /\.mp4(?:[?#]|$)/i.test(url.pathname)) {
    const pathQuality = url.pathname.match(/(?:^|\/)(\d{3,4})p(?:\/|$)/i)?.[1];

    return [
      {
        url: url.toString(),
        quality: quality ?? streamQuality(pathQuality),
        audioDelay: 0,
      },
    ];
  }

  const response = await fetch(target, {
    headers: { Referer: referer, 'User-Agent': userAgent },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    return [];
  }

  const text = await response.text();

  try {
    const references = mediaReferences(JSON.parse(text), quality).filter(
      ({ url }) => url !== target
    );
    const streams = await Promise.all(
      references.map((reference) =>
        resolveTarget(reference.url, reference.quality, depth + 1).catch(() => [])
      )
    );

    return streams.flat();
  } catch {
    const embedded = text.match(/src:\s*["']([^"']+)["']/)?.[1];

    return embedded ? resolveTarget(new URL(embedded, target).toString(), quality, depth + 1) : [];
  }
}
