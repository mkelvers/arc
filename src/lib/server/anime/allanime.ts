import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';
import {
    AllAnimeAvailableEpisodesDocument,
    AllAnimeSearchDocument,
    type AllAnimeAvailableEpisodesQuery,
    type AllAnimeSearchQuery,
    type VaildTranslationTypeEnumType,
} from '$lib/graphql/allanime/generated/graphql';
import { graphql } from '$lib/server/graphql';
import { Effect } from 'effect';
import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';

type AniListAnime = NonNullable<AnimeQuery['Media']>;

const endpoint = 'https://api.mkissa.net/api';
const site = 'https://allanime.day';
const referer = 'https://youtu-chan.com';
const origin = 'https://mkissa.to';
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
const episodeSourcesQueryHash =
    'f4662f4b7510b26795dd53ef824a0bf1740fbbc5d1273fab18222ac831bca8d0';

interface StreamCrypto {
    buildId: string;
    epoch: number;
    key: Buffer;
    refreshAt: number;
}

let cachedStreamCrypto: StreamCrypto | null = null;

export interface AllAnimeEpisode {
    id: string;
    number: number;
    label: string;
    title: string;
    hasSub: boolean;
    hasDub: boolean;
}

function request<TResult, TVariables>(
    document: Parameters<typeof graphql<TResult, TVariables>>[1],
    variables: TVariables,
) {
    return Effect.runPromise(
        graphql(endpoint, document, variables, {
            headers: {
                Referer: referer,
                'User-Agent': userAgent,
            },
        }),
    );
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

async function findShowId(anime: AniListAnime) {
    if (!anime.idMal) throw new Error(`AniList ${anime.id} has no MAL ID`);

    const titles = [
        anime.title?.english,
        anime.title?.romaji,
        anime.title?.native,
        ...(anime.synonyms ?? []),
    ].filter(
        (title, index, titles): title is string =>
            Boolean(title?.trim()) && titles.indexOf(title) === index,
    );

    for (const translationType of ['sub', 'dub'] as const) {
        for (const query of titles) {
            const data = await request<AllAnimeSearchQuery, {
                search: {
                    allowAdult: boolean;
                    allowUnknown: boolean;
                    query: string;
                };
                translationType: VaildTranslationTypeEnumType;
            }>(AllAnimeSearchDocument, {
                search: {
                    allowAdult: false,
                    allowUnknown: false,
                    query,
                },
                translationType,
            });
            const match = data.shows?.edges?.find(
                (show) => Number(show.malId) === anime.idMal && show._id,
            );

            if (match?._id) return match._id;
        }
    }

    throw new Error(`AllAnime has no exact MAL match for ${anime.idMal}`);
}

async function getEpisodes(anime: AniListAnime): Promise<AllAnimeEpisode[]> {
    const showId = await findShowId(anime);
    const data = await request<
        AllAnimeAvailableEpisodesQuery,
        { showId: string; start: number; end: number }
    >(AllAnimeAvailableEpisodesDocument, {
        showId,
        start: 0,
        end: 100_000,
    });

    if (!data.show) throw new Error(`AllAnime show ${showId} was not found`);

    const detail = asRecord(data.show.availableEpisodesDetail) ?? {};
    const strings = (key: 'sub' | 'dub' | 'raw') => {
        const values = detail[key];
        if (!Array.isArray(values)) return [];
        return values.filter(
            (value): value is string => typeof value === 'string',
        );
    };
    const sub = new Set([...strings('sub'), ...strings('raw')]);
    const dub = new Set(strings('dub'));
    const titles = new Map(
        (data.episodeInfos ?? []).flatMap((episode) => {
            const id = String(episode.episodeIdNum ?? '').trim();
            const title = (episode.notes ?? '')
                .replace(/<br\s*\/?>/gi, ' ')
                .replace(/<[^>]+>/g, '')
                .replaceAll('&amp;', '&')
                .replaceAll('&quot;', '"')
                .replaceAll('&#39;', "'")
                .replaceAll('&lt;', '<')
                .replaceAll('&gt;', '>')
                .replace(/\s+/g, ' ')
                .trim();

            return id && title ? [[id, title] as const] : [];
        }),
    );
    const expectedCount = anime.episodes ?? 0;

    return [...new Set([...sub, ...dub])]
        .flatMap((id) => {
            const number = Number(id);
            const regular = Number.isInteger(number);

            if (
                !Number.isFinite(number) ||
                number < 0 ||
                (regular && expectedCount > 0 && number > expectedCount)
            ) {
                return [];
            }

            return [
                {
                    id,
                    number,
                    label: `E${regular ? number : id}`,
                    title: titles.get(id) ?? '',
                    hasSub: sub.has(id),
                    hasDub: dub.has(id),
                },
            ];
        })
        .sort((left, right) => left.number - right.number);
}

async function getStreamCrypto(refresh = false) {
    if (
        !refresh &&
        cachedStreamCrypto &&
        Date.now() < cachedStreamCrypto.refreshAt
    ) {
        return cachedStreamCrypto;
    }

    const pageResponse = await fetch(origin, {
        headers: { 'User-Agent': userAgent },
    });
    if (!pageResponse.ok) {
        throw new Error(`AllAnime bootstrap failed (${pageResponse.status})`);
    }

    const page = await pageResponse.text();
    const rawBootstrap = page.match(/window\.__aaCrypto=(\{[^;]+\})/)?.[1];
    const appUrl = page.match(
        /https:\/\/[^"' ]+\/immutable\/entry\/app\.[^"' ]+\.js/,
    )?.[0];
    if (!rawBootstrap || !appUrl) {
        throw new Error('AllAnime bootstrap data was not found');
    }

    const bootstrap = asRecord(JSON.parse(rawBootstrap));
    const epoch = Number(bootstrap?.epoch);
    const part = Buffer.from(String(bootstrap?.partB ?? ''), 'base64');
    if (!Number.isSafeInteger(epoch) || part.length !== 32) {
        throw new Error('AllAnime bootstrap data was invalid');
    }

    const appResponse = await fetch(appUrl);
    if (!appResponse.ok) {
        throw new Error(`AllAnime app manifest failed (${appResponse.status})`);
    }

    const app = await appResponse.text();
    const chunks = [
        ...new Set(
            [...app.matchAll(/["'](\.\.\/chunks\/[^"']+\.js)["']/g)].map(
                (match) => new URL(match[1], appUrl).toString(),
            ),
        ),
    ];
    let mask: Buffer | null = null;
    let buildId = '';

    for (const chunkUrl of chunks) {
        const response = await fetch(chunkUrl);
        if (!response.ok) continue;

        const chunk = await response.text();
        const match = chunk.match(
            /\?["']([0-9a-f]{64})["']:["']["'],\w+=["'](\d+)["']/,
        );
        if (!match) continue;

        mask = Buffer.from(match[1], 'hex');
        buildId = match[2];
        break;
    }

    if (!mask || !buildId) {
        throw new Error('AllAnime client encryption data was not found');
    }

    const key = Buffer.alloc(32);
    for (let index = 0; index < key.length; index++) {
        key[index] = part[index] ^ mask[index];
    }

    cachedStreamCrypto = {
        buildId,
        epoch,
        key,
        refreshAt: Date.now() + 300_000,
    };
    return cachedStreamCrypto;
}

function aaLease(crypto: StreamCrypto, queryHash: string) {
    const timestamp = Math.floor(Date.now() / 300_000) * 300_000;
    const iv = createHash('sha256')
        .update(`${crypto.epoch}:${crypto.buildId}:${queryHash}:${timestamp}`)
        .digest()
        .subarray(0, 12);
    const payload = JSON.stringify({
        v: 1,
        ts: timestamp,
        epoch: crypto.epoch,
        buildId: crypto.buildId,
        qh: queryHash,
    });
    const cipher = createCipheriv('aes-256-gcm', crypto.key, iv);
    const encrypted = Buffer.concat([
        cipher.update(payload, 'utf8'),
        cipher.final(),
    ]);

    return Buffer.concat([
        Buffer.from([1]),
        iv,
        encrypted,
        cipher.getAuthTag(),
    ]).toString('base64');
}

function decryptedPayload(value: string, key: Buffer) {
    const encrypted = Buffer.from(value, 'base64');

    if (encrypted.length < 30 || encrypted[0] !== 1) {
        throw new Error('AllAnime returned an invalid encrypted payload');
    }

    const iv = encrypted.subarray(1, 13);
    const tag = encrypted.subarray(-16);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    return JSON.parse(
        Buffer.concat([
            decipher.update(encrypted.subarray(13, -16)),
            decipher.final(),
        ]).toString('utf8'),
    ) as unknown;
}

interface Source {
    name: string;
    url: string;
}

function sourceReferences(value: unknown): Source[] {
    const root = asRecord(value);
    const data = asRecord(root?.data) ?? root;
    const episode = asRecord(data?.episode) ?? data;
    const urls = episode?.sourceUrls;

    if (!Array.isArray(urls)) return [];

    return urls.flatMap((value) => {
        const source = asRecord(value);
        const name = source?.sourceName;
        const url = source?.sourceUrl;

        if (typeof name !== 'string' || typeof url !== 'string') return [];
        return [{ name, url }];
    });
}

const substitutions = new Map(
    [
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~:/?#[]@!$&()*+,;=%',
    ].map((character) => [
        (character.charCodeAt(0) ^ 0x38).toString(16).padStart(2, '0'),
        character,
    ]),
);

function decodeSourceUrl(value: string) {
    if (!value.startsWith('--')) return value;

    const encoded = value.slice(2);
    let decoded = '';

    for (let index = 0; index < encoded.length; index += 2) {
        const pair = encoded.slice(index, index + 2);
        decoded += substitutions.get(pair) ?? pair;
    }

    return decoded.replace('/clock', '/clock.json');
}

function mediaUrls(value: unknown): string[] {
    if (typeof value === 'string') {
        return /^https?:\/\//.test(value) ? [value] : [];
    }
    if (Array.isArray(value)) return value.flatMap(mediaUrls);

    const object = asRecord(value);
    if (!object) return [];

    return Object.entries(object).flatMap(([key, child]) => {
        if (['link', 'url', 'file', 'src'].includes(key.toLowerCase())) {
            return mediaUrls(child);
        }

        return typeof child === 'object' ? mediaUrls(child) : [];
    });
}

async function resolveTarget(target: string, depth = 0): Promise<string | null> {
    if (depth > 4) return null;

    const url = new URL(target);
    const host = url.hostname.toLowerCase();
    const directHost =
        host === 'tools.fast4speed.rsvp' ||
        host === 'repackager.wixmp.com' ||
        host.endsWith('.sharepoint.com');

    if (directHost || /\.(?:mp4|m3u8)(?:[?#]|$)/i.test(url.pathname)) {
        return url.toString();
    }

    const response = await fetch(target, {
        headers: { Referer: referer, 'User-Agent': userAgent },
    });

    if (!response.ok) return null;

    const text = await response.text();
    try {
        const urls = [...new Set(mediaUrls(JSON.parse(text)))].filter(
            (candidate) => candidate !== target,
        );
        const ordered = urls.toSorted((left, right) => {
            const rank = (candidate: string) => {
                if (/\.mp4(?:[?#]|$)/i.test(candidate)) return 0;
                if (candidate.includes('tools.fast4speed.rsvp')) return 1;
                if (/\.m3u8(?:[?#]|$)/i.test(candidate)) return 2;
                return 3;
            };

            return rank(left) - rank(right);
        });

        for (const candidate of ordered) {
            const resolved = await resolveTarget(candidate, depth + 1).catch(
                () => null,
            );
            if (resolved) return resolved;
        }

        return null;
    } catch {
        const embedded = text.match(/src:\s*["']([^"']+)["']/)?.[1];
        return embedded
            ? resolveTarget(new URL(embedded, target).toString(), depth + 1)
            : null;
    }
}

async function encryptedSources(
    showId: string,
    episode: string,
    translationType: 'sub' | 'dub',
    crypto: StreamCrypto,
) {
    const url = new URL(endpoint);
    url.searchParams.set(
        'variables',
        JSON.stringify({
            showId,
            translationType,
            episodeString: episode,
        }),
    );
    url.searchParams.set(
        'extensions',
        JSON.stringify({
            persistedQuery: {
                version: 1,
                sha256Hash: episodeSourcesQueryHash,
            },
            aaReq: aaLease(crypto, episodeSourcesQueryHash),
        }),
    );

    const response = await fetch(url, {
        headers: {
            Origin: origin,
            Referer: referer,
            'User-Agent': userAgent,
            'x-build-id': crypto.buildId,
        },
    });
    const payload = (await response.json()) as unknown;
    const root = asRecord(payload);
    const data = asRecord(root?.data);
    const episodeData = asRecord(data?.episode);
    const encrypted = data?.tobeparsed ?? episodeData?.tobeparsed;

    if (typeof encrypted === 'string') {
        const decrypted = decryptedPayload(encrypted, crypto.key);
        const sources = sourceReferences(decrypted);
        if (!sources.length) {
            throw new Error('AllAnime decrypted no episode sources');
        }
        return sources;
    }

    const sources = sourceReferences(payload);
    if (sources.length) return sources;

    const message = Array.isArray(root?.errors)
        ? asRecord(root.errors[0])?.message
        : null;
    throw new Error(
        typeof message === 'string'
            ? `AllAnime: ${message}`
            : 'AllAnime returned no episode sources',
    );
}

async function getStream(anime: AniListAnime, episode: string) {
    const showId = await findShowId(anime);
    let crypto = await getStreamCrypto();
    let refreshed = false;
    const errors: unknown[] = [];

    for (const translationType of ['sub', 'dub'] as const) {
        let sources: Source[];

        try {
            sources = await encryptedSources(
                showId,
                episode,
                translationType,
                crypto,
            );
        } catch (error) {
            if (
                !refreshed &&
                error instanceof Error &&
                error.message.includes('AA_CRYPTO')
            ) {
                refreshed = true;
                crypto = await getStreamCrypto(true);

                try {
                    sources = await encryptedSources(
                        showId,
                        episode,
                        translationType,
                        crypto,
                    );
                } catch (retryError) {
                    errors.push(retryError);
                    continue;
                }
            } else {
                errors.push(error);
                continue;
            }
        }

        const ordered = sources.toSorted((left, right) => {
            const priority = ['yt-mp4', 's-mp4', 'default', 'mp4'];
            const rank = (source: Source) => {
                const index = priority.indexOf(source.name.toLowerCase());
                return index < 0 ? priority.length : index;
            };

            return rank(left) - rank(right);
        });

        for (const source of ordered) {
            const decoded = decodeSourceUrl(source.url);
            const target = /^https?:\/\//.test(decoded)
                ? decoded
                : `${site}${decoded.startsWith('/') ? '' : '/'}${decoded}`;
            const url = await resolveTarget(target).catch(() => null);
            if (url) return url;
        }

        errors.push(
            new Error(
                `AllAnime ${translationType} sources could not be resolved: ${ordered
                    .map(({ name, url }) => `${name} (${url})`)
                    .join(', ')}`,
            ),
        );
    }

    throw new AggregateError(
        errors,
        `AllAnime returned no playable source for episode ${episode}`,
    );
}

export const allanime = { getEpisodes, getStream };
