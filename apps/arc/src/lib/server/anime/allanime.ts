import type { AudioMode } from '$lib/audio';
import { RequestCache } from '$lib/server/request-cache';
import { record } from '$lib/utils';
import type { AniListAnime } from './anilist/types';
import { findShowId } from './allanime/catalog';
import {
    contentLane,
    endpoint,
    origin,
    referer,
    site,
    sourceQueryHash,
    userAgent,
} from './allanime/client';
import { decrypt, getCrypto, lease } from './allanime/crypto';
import { decodeSourceUrl, resolveTarget, sourceReferences } from './allanime/sources';
import type { Source, Stream, StreamCrypto, Streams } from './allanime/types';

const cache = new RequestCache<string, Streams>(2 * 60 * 1_000);
const priority = ['default', 's-mp4', 'yt-mp4', 'mp4'];

async function encryptedSources(
    showId: string,
    episode: string,
    mode: AudioMode,
    crypto: StreamCrypto
) {
    const url = new URL(endpoint);
    url.searchParams.set(
        'variables',
        JSON.stringify({
            showId,
            translationType: mode,
            episodeString: episode,
        })
    );
    url.searchParams.set(
        'extensions',
        JSON.stringify({
            persistedQuery: {
                version: 1,
                sha256Hash: sourceQueryHash,
            },
            k: contentLane,
            aaReq: lease(crypto, sourceQueryHash),
        })
    );

    const response = await fetch(url, {
        headers: {
            Origin: origin,
            Referer: referer,
            'User-Agent': userAgent,
            'x-build-id': crypto.buildId,
        },
        signal: AbortSignal.timeout(6_000),
    });
    const payload = (await response.json()) as unknown;
    const root = record(payload);
    const data = record(root?.data);
    const episodeData = record(data?.episode);
    const encrypted = data?.tobeparsed ?? episodeData?.tobeparsed;

    if (typeof encrypted === 'string') {
        const sources = sourceReferences(decrypt(encrypted, crypto.key));
        if (!sources.length) {
            throw new Error('AllAnime decrypted no episode sources');
        }

        return sources;
    }

    const sources = sourceReferences(payload);
    if (sources.length) {
        return sources;
    }

    const message = Array.isArray(root?.errors) ? record(root.errors[0])?.message : null;

    throw new Error(
        typeof message === 'string'
            ? `AllAnime: ${message}`
            : 'AllAnime returned no episode sources'
    );
}

function sourceRank(source: Source) {
    const rank = priority.indexOf(source.name.toLowerCase());
    return rank < 0 ? priority.length : rank;
}

async function playableSources(sources: Source[], mode: AudioMode) {
    const ordered = sources.toSorted((left, right) => sourceRank(left) - sourceRank(right));
    const supported = ordered.filter((source) => priority.includes(source.name.toLowerCase()));
    const candidates = supported.length ? supported : ordered;
    const results = await Promise.all(
        candidates.map(async (source) => {
            const decoded = decodeSourceUrl(source.url);
            const target = /^https?:\/\//.test(decoded)
                ? decoded
                : `${site}${decoded.startsWith('/') ? '' : '/'}${decoded}`;

            try {
                return { source, streams: await resolveTarget(target), error: null };
            } catch (cause) {
                return { source, streams: [], error: cause };
            }
        })
    );
    const resolved = results
        .flatMap(({ streams }) => streams)
        .filter(
            (stream, index, values) => values.findIndex(({ url }) => url === stream.url) === index
        )
        .toSorted(
            (left, right) =>
                Number.parseInt(right.quality ?? '0') - Number.parseInt(left.quality ?? '0')
        );

    if (!resolved.length) {
        const failures = results
            .filter(({ error }) => error)
            .map(
                ({ source, error }) =>
                    `${source.name}: ${error instanceof Error ? error.message : String(error)}`
            );
        throw new Error(
            `AllAnime ${mode} sources could not be resolved: ${
                failures.length
                    ? failures.join('; ')
                    : candidates.map(({ name, url }) => `${name} (${url})`).join(', ')
            }`
        );
    }

    return resolved.map((stream): Stream => ({
        ...stream,
    }));
}

async function resolveStreams(anime: AniListAnime, episode: string, modes: AudioMode[]) {
    const showId = await findShowId(anime);
    let crypto = await getCrypto();
    const load = (mode: AudioMode) =>
        encryptedSources(showId, episode, mode, crypto).then(
            (sources) => ({ mode, sources, error: null }),
            (error: unknown) => ({ mode, sources: null, error })
        );
    let sourceResults = await Promise.all(modes.map(load));

    if (
        sourceResults.some(
            ({ error }) => error instanceof Error && error.message.includes('AA_CRYPTO')
        )
    ) {
        crypto = await getCrypto(true);
        sourceResults = await Promise.all(
            sourceResults.map((result) =>
                result.error instanceof Error && result.error.message.includes('AA_CRYPTO')
                    ? load(result.mode)
                    : Promise.resolve(result)
            )
        );
    }

    const results = await Promise.all(
        sourceResults.map(async ({ mode, sources, error }) => {
            if (!sources) {
                return { mode, streams: null, error };
            }

            try {
                return {
                    mode,
                    streams: await playableSources(sources, mode),
                    error: null,
                };
            } catch (cause) {
                return { mode, streams: null, error: cause };
            }
        })
    );
    const streams: Streams = {};
    const errors: unknown[] = [];

    for (const result of results) {
        if (result.streams) {
            streams[result.mode] = result.streams;
        } else {
            errors.push(result.error);
        }
    }

    if (Object.keys(streams).length) {
        return streams;
    }

    const details = errors
        .map((error) => (error instanceof Error ? error.message : String(error)))
        .filter(Boolean)
        .join('; ');
    throw new AggregateError(
        errors,
        `AllAnime returned no playable source for episode ${episode}${details ? `: ${details}` : ''}`
    );
}

export async function getStreams(anime: AniListAnime, episode: string, modes: AudioMode[]) {
    const key = `${anime.id}:${episode}:${modes.toSorted().join(',')}`;
    return cache.get(key, () => resolveStreams(anime, episode, modes));
}
