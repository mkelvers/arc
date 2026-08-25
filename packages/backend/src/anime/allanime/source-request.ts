import type { AudioMode } from '@arc/shared/audio';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AllAnimeExpandedEpisodeSourcesDocument } from './generated/graphql';
import { contentLane, endpoint, origin, referer, sourceQueryHash, userAgent } from './client';
import { decrypt, lease } from './crypto';
import { sourceReferences } from './sources';
import type { StreamCrypto } from './types';

const expandedSourceQueryHash = '04bd3a7b24fc732c07c2e3bd92126bcdd901293c9dfbe678352dca0f4877d697';
const expandedSourceQuery = AllAnimeExpandedEpisodeSourcesDocument.toString();
const expandedSourcePostHash = createHash('sha256').update(expandedSourceQuery).digest('hex');
const responseSchema = z
    .object({
        data: z
            .object({
                tobeparsed: z.string().optional(),
                episode: z.object({ tobeparsed: z.string().optional() }).optional(),
            })
            .optional(),
        errors: z.array(z.object({ message: z.string() })).optional(),
    })
    .passthrough();
const jsonValueSchema = z.json();

type RequestTransport = (
    input: URL | RequestInfo,
    init?: RequestInit | undefined
) => Promise<Response>;

export async function encryptedSources(
    showId: string,
    episode: string,
    mode: AudioMode,
    crypto: StreamCrypto,
    fetcher: RequestTransport = fetch
) {
    const variables = { showId, translationType: mode, episodeString: episode };
    const headers = {
        Origin: origin,
        Referer: referer,
        'User-Agent': userAgent,
        'x-build-id': crypto.buildId,
    };

    for (const hash of [sourceQueryHash, expandedSourceQueryHash]) {
        const extensions = {
            persistedQuery: { version: 1, sha256Hash: hash },
            k: contentLane,
            aaReq: lease(crypto, hash),
        };
        const url = new URL(endpoint);
        url.searchParams.set('variables', JSON.stringify(variables));
        url.searchParams.set('extensions', JSON.stringify(extensions));

        const response = await fetcher(url, {
            headers,
            signal: AbortSignal.timeout(6_000),
        });
        if (!response.ok) {
            throw new Error(`AllAnime source request returned ${response.status}`);
        }

        const json = jsonValueSchema.safeParse(await response.json());
        const rawPayload = json.success ? json.data : null;
        const parsed = responseSchema.safeParse(rawPayload);
        const payload = parsed.success ? parsed.data : null;
        const message = payload?.errors?.[0]?.message;

        if (
            message &&
            /PersistedQueryNotFound|Context creation failed|Cannot set properties of undefined/i.test(
                message
            )
        ) {
            continue;
        }

        const encrypted = payload?.data?.tobeparsed ?? payload?.data?.episode?.tobeparsed;
        if (encrypted) {
            const decrypted = z.json().safeParse(decrypt(encrypted, crypto.key));
            const sources = decrypted.success ? sourceReferences(decrypted.data) : [];
            if (!sources.length) {
                throw new Error('AllAnime decrypted no episode sources');
            }
            return sources;
        }

        const sources = sourceReferences(rawPayload);
        if (sources.length) {
            return sources;
        }
        throw new Error(message ? `AllAnime: ${message}` : 'AllAnime returned no episode sources');
    }

    const extensions = {
        persistedQuery: { version: 1, sha256Hash: expandedSourcePostHash },
        k: contentLane,
        aaReq: lease(crypto, expandedSourcePostHash),
    };
    const response = await fetcher(endpoint, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: expandedSourceQuery, variables, extensions }),
        signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) {
        throw new Error(`AllAnime source POST returned ${response.status}`);
    }

    const json = jsonValueSchema.safeParse(await response.json());
    const rawPayload = json.success ? json.data : null;
    const parsed = responseSchema.safeParse(rawPayload);
    const payload = parsed.success ? parsed.data : null;
    const encrypted = payload?.data?.tobeparsed ?? payload?.data?.episode?.tobeparsed;

    if (encrypted) {
        const decrypted = z.json().safeParse(decrypt(encrypted, crypto.key));
        const sources = decrypted.success ? sourceReferences(decrypted.data) : [];
        if (sources.length) {
            return sources;
        }
    }

    const sources = sourceReferences(rawPayload);
    if (sources.length) {
        return sources;
    }

    const message = payload?.errors?.[0]?.message;
    throw new Error(message ? `AllAnime: ${message}` : 'AllAnime returned no episode sources');
}
