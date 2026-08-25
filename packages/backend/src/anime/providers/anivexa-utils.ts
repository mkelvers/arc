import type { z } from 'zod';

import type { AudioMode } from '@arc/shared/audio';

export function httpsUrl(value: string, base?: URL) {
    try {
        const url = new URL(value, base);
        return url.protocol === 'https:' ? url : null;
    } catch {
        return null;
    }
}

export async function requestText(url: URL, headers: HeadersInit = {}, init: RequestInit = {}) {
    const response = await fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
        throw new Error(`Anivexa upstream returned ${response.status} for ${url.pathname}`);
    }
    return response.text();
}

export async function requestJson<T extends z.ZodType>(
    url: URL,
    schema: T,
    headers: HeadersInit = {},
    init: RequestInit = {}
) {
    const text = await requestText(url, headers, init);
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch (cause) {
        throw new Error(`Anivexa upstream returned invalid JSON for ${url.pathname}`, { cause });
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        throw new Error(`Anivexa upstream returned an invalid payload for ${url.pathname}`);
    }
    return parsed.data as z.infer<T>;
}

export function requestedModes(modes: AudioMode[]) {
    return new Set(modes.filter((mode) => mode !== 'raw'));
}

export function episodeNumber(value: string | number | null | undefined) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}
