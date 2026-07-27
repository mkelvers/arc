import { eq } from 'drizzle-orm';
import type { AnimeQuery } from '$lib/graphql/anilist/generated/graphql';
import type { AudioMode } from '$lib/anime/audio';
import {
    AllAnimeAvailableEpisodesDocument,
    AllAnimePopularAudioDocument,
    AllAnimeSearchDocument,
    type AllAnimeAvailableEpisodesQuery,
    type AllAnimeSearchQuery,
    type VaildTranslationTypeEnumType,
} from '$lib/graphql/allanime/generated/graphql';
import { graphql } from '$lib/server/graphql';
import { db } from '$lib/server/db';
import { animePlaybackProvider } from '$lib/server/db/schema';
import { audioDelayFromMp4 } from '$lib/server/anime/mp4';
import { Effect } from 'effect';
import {
    createCipheriv,
    createDecipheriv,
    createHash,
    createHmac,
} from 'node:crypto';

type AniListAnime = NonNullable<AnimeQuery['Media']>;

const endpoint = 'https://api.mkissa.net/api';
const site = 'https://allanime.day';
const referer = 'https://youtu-chan.com';
const origin = 'https://mkissa.to';
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
const episodeSourcesQueryHash =
    'f4662f4b7510b26795dd53ef824a0bf1740fbbc5d1273fab18222ac831bca8d0';
const streamContentLane = 'k7';
const bootstrapEpochLength = 259_200_000;
const bootstrapGraceLength = 86_400_000;

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
    audio: AudioMode[];
}

export interface AllAnimeStream {
    url: string;
    quality: string | null;
    audioDelay: number;
}

type AllAnimeStreams = Partial<Record<AudioMode, AllAnimeStream[]>>;

const streamCache = new Map<
    string,
    { streams: AllAnimeStreams; expiresAt: number }
>();
const streamRequests = new Map<string, Promise<AllAnimeStreams>>();
const popularAudioCacheLifetime = 30 * 60 * 1_000;
let popularAudioCache: {
    labels: Map<number, AudioMode[]>;
    fetchedAt: number;
} | null = null;
let popularAudioRequest: Promise<Map<number, AudioMode[]>> | null = null;

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

function audioModes(value: unknown) {
    const detail = asRecord(value);
    if (!detail) return [];

    return (['sub', 'dub', 'raw'] as const).filter((mode) => {
        const episodes = detail[mode];
        return Array.isArray(episodes) && episodes.length > 0;
    });
}

async function getPopularAudioLabels() {
    if (
        popularAudioCache &&
        Date.now() - popularAudioCache.fetchedAt < popularAudioCacheLifetime
    ) {
        return popularAudioCache.labels;
    }
    if (popularAudioRequest) return popularAudioRequest;

    popularAudioRequest = request(AllAnimePopularAudioDocument, {}).then(
        (data) => {
            const labels = new Map<number, AudioMode[]>();

            for (
                const recommendation of
                    data.queryPopular?.recommendations ?? []
            ) {
                const card = recommendation.anyCard;
                const anilistId = Number(card?.aniListId);
                const audio = audioModes(card?.availableEpisodesDetail);

                if (
                    Number.isSafeInteger(anilistId) &&
                    anilistId > 0 &&
                    audio.length
                ) {
                    labels.set(anilistId, audio);
                }
            }

            popularAudioCache = { labels, fetchedAt: Date.now() };
            return labels;
        },
    );

    try {
        return await popularAudioRequest;
    } finally {
        popularAudioRequest = null;
    }
}

async function findShowId(anime: AniListAnime, refresh = false) {
    if (!anime.idMal) throw new Error(`AniList ${anime.id} has no MAL ID`);

    if (!refresh) {
        const [stored] = await db
            .select({ showId: animePlaybackProvider.allanimeShowId })
            .from(animePlaybackProvider)
            .where(eq(animePlaybackProvider.anilistId, anime.id))
            .limit(1);

        if (stored) return stored.showId;
    }

    const titles = [
        anime.title?.english,
        anime.title?.romaji,
        anime.title?.native,
        ...(anime.synonyms ?? []),
    ].filter(
        (title, index, titles): title is string =>
            Boolean(title?.trim()) && titles.indexOf(title) === index,
    );

    for (const translationType of ['sub', 'dub', 'raw'] as const) {
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

            if (match?._id) {
                const now = new Date();
                await db
                    .insert(animePlaybackProvider)
                    .values({
                        anilistId: anime.id,
                        allanimeShowId: match._id,
                        discoveredAt: now,
                        verifiedAt: now,
                    })
                    .onConflictDoUpdate({
                        target: animePlaybackProvider.anilistId,
                        set: {
                            allanimeShowId: match._id,
                            verifiedAt: now,
                        },
                    });

                return match._id;
            }
        }
    }

    throw new Error(`AllAnime has no exact MAL match for ${anime.idMal}`);
}

async function getEpisodes(anime: AniListAnime): Promise<AllAnimeEpisode[]> {
    let showId = await findShowId(anime);
    const load = (id: string) =>
        request<
            AllAnimeAvailableEpisodesQuery,
            { showId: string; start: number; end: number }
        >(AllAnimeAvailableEpisodesDocument, {
            showId: id,
            start: 0,
            end: 100_000,
        });
    let data = await load(showId);

    if (!data.show) {
        showId = await findShowId(anime, true);
        data = await load(showId);
    }

    if (!data.show) throw new Error(`AllAnime show ${showId} was not found`);
    await db
        .update(animePlaybackProvider)
        .set({ verifiedAt: new Date() })
        .where(eq(animePlaybackProvider.anilistId, anime.id));

    const detail = asRecord(data.show.availableEpisodesDetail) ?? {};
    const strings = (key: 'sub' | 'dub' | 'raw') => {
        const values = detail[key];
        if (!Array.isArray(values)) return [];
        return values.filter(
            (value): value is string => typeof value === 'string',
        );
    };
    const sub = new Set(strings('sub'));
    const dub = new Set(strings('dub'));
    const raw = new Set(strings('raw'));
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
    return [...new Set([...sub, ...dub, ...raw])]
        .flatMap((id) => {
            const number = Number(id);
            const regular = Number.isInteger(number);

            if (!Number.isFinite(number) || number < 0) {
                return [];
            }

            return [
                {
                    id,
                    number,
                    label: `E${regular ? number : id}`,
                    title: titles.get(id) ?? '',
                    audio: [
                        ...(sub.has(id) ? ['sub' as const] : []),
                        ...(dub.has(id) ? ['dub' as const] : []),
                        ...(raw.has(id) ? ['raw' as const] : []),
                    ],
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
        signal: AbortSignal.timeout(10_000),
    });
    if (!pageResponse.ok) {
        throw new Error(`AllAnime bootstrap failed (${pageResponse.status})`);
    }

    const page = await pageResponse.text();
    const rawBootstrap = page.match(/window\.__aaCrypto=(\{[^;]+\})/)?.[1];
    const appUrl = page.match(
        /https:\/\/[^"' ]+\/immutable\/entry\/app\.[^"' ]+\.js/,
    )?.[0];
    if (!appUrl) throw new Error('AllAnime app manifest was not found');

    const appResponse = await fetch(appUrl, {
        signal: AbortSignal.timeout(10_000),
    });
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
        const response = await fetch(chunkUrl, {
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) continue;

        const chunk = await response.text();
        const legacy = chunk.match(
            /\?["']([0-9a-f]{64})["']:["']["'],\w+=[^;]{0,100}\?["']([A-Za-z0-9._-]+)["']:["']["']/,
        );
        if (legacy) {
            mask = Buffer.from(legacy[1], 'hex');
            buildId = legacy[2];
            break;
        }

        if (
            !chunk.includes('/client-crypto/v1/bootstrap?buildId=') ||
            !chunk.includes('aa-boo') ||
            !chunk.includes('partB')
        ) {
            continue;
        }

        const table = [
            ...chunk.matchAll(
                /function (\w+)\(\)\{const \w+=\[(.*?)\];return \1=function/g,
            ),
        ].find(
            (match) =>
                match[2].includes('"aa-boo"') &&
                match[2].includes('"web_cr"'),
        );
        const base = table
            ? chunk.match(
                  new RegExp(
                      `function (\\w+)\\((\\w+),\\w+\\)\\{return \\2=\\2-\\(([-+*/\\d ]+)\\),${table[1]}\\(\\)\\[\\2\\]\\}`,
                  ),
              )
            : null;
        if (!table || !base) continue;

        const calculate = (expression: string) => {
            const tokens = expression.match(/\d+|[-+*/]/g) ?? [];
            if (tokens.join('') !== expression.replaceAll(' ', '')) return NaN;

            let position = 0;
            const factor = (): number => {
                const operator = tokens[position];
                if (operator === '+' || operator === '-') {
                    position++;
                    const value = factor();
                    return operator === '-' ? -value : value;
                }

                const value = Number(tokens[position++]);
                return Number.isFinite(value) ? value : NaN;
            };
            const term = () => {
                let value = factor();
                while (
                    tokens[position] === '*' ||
                    tokens[position] === '/'
                ) {
                    const operator = tokens[position++];
                    const right = factor();
                    value =
                        operator === '*' ? value * right : value / right;
                }
                return value;
            };
            let value = term();
            while (tokens[position] === '+' || tokens[position] === '-') {
                const operator = tokens[position++];
                const right = term();
                value = operator === '+' ? value + right : value - right;
            }

            return position === tokens.length ? value : NaN;
        };
        const baseOffset = calculate(base[3]);
        if (!Number.isSafeInteger(baseOffset)) continue;

        const wrappers = new Map<
            string,
            { argument: number; offset: number }
        >();
        const wrapperPattern = new RegExp(
            `function (\\w+)\\((\\w+),(\\w+)\\)\\{return ${base[1]}\\((\\2|\\3)-\\s*([-+*/\\d ]+)\\)\\}`,
            'g',
        );
        for (const wrapper of chunk.matchAll(wrapperPattern)) {
            const offset = calculate(wrapper[5]);
            if (!Number.isSafeInteger(offset)) continue;
            wrappers.set(wrapper[1], {
                argument: wrapper[4] === wrapper[2] ? 0 : 1,
                offset: baseOffset + offset,
            });
        }

        const client = chunk.match(
            /const \w+=(\w+)\((\d+)\)\+\1\((\d+)\)!=="string"\?"([A-Za-z0-9._-]+)":"",\w+=\[([^\]]+)\]/,
        );
        const buildResolver = client ? wrappers.get(client[1]) : null;
        if (!client || !buildResolver) continue;

        const strings = [
            ...table[2].matchAll(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g),
        ].map((match) => (match[1] ?? match[2]).replace(/\\(["'\\])/g, '$1'));
        const valueAt = (
            values: string[],
            resolver: { argument: number; offset: number },
            args: number[],
        ) => values[args[resolver.argument] - resolver.offset];
        let values: string[] | null = null;

        for (let rotation = 0; rotation < strings.length; rotation++) {
            const rotated = [
                ...strings.slice(rotation),
                ...strings.slice(0, rotation),
            ];
            if (
                valueAt(rotated, buildResolver, [Number(client[2])]) +
                    valueAt(rotated, buildResolver, [Number(client[3])]) ===
                'undefined'
            ) {
                values = rotated;
                break;
            }
        }
        if (!values) continue;

        const encodedParts = [
            ...client[5].matchAll(
                /\w+\(\d+(?:,\d+)?\)\+\w+\(\d+(?:,\d+)?\)/g,
            ),
        ].flatMap(([expression]) => {
            const calls = [
                ...expression.matchAll(/(\w+)\((\d+)(?:,(\d+))?\)/g),
            ];
            if (calls.length !== 2) return [];

            const part = calls
                .map((call) => {
                    const resolver = wrappers.get(call[1]);
                    const args = call
                        .slice(2)
                        .filter((value): value is string => Boolean(value))
                        .map(Number);
                    return resolver ? valueAt(values!, resolver, args) : '';
                })
                .join('');
            return part ? [Buffer.from(part, 'base64')] : [];
        });
        if (
            encodedParts.length !== 4 ||
            encodedParts.some((part) => part.length !== 8)
        ) {
            continue;
        }

        buildId = client[4];
        const seed = Buffer.alloc(32);
        for (let index = 0; index < seed.length; index++) {
            seed[index] =
                buildId.charCodeAt(index % buildId.length) ^
                ((index * 17 + 31) & 0xff);
        }

        mask = Buffer.alloc(32);
        encodedParts.forEach((part, group) => {
            for (let index = 0; index < part.length; index++) {
                const offset = group * part.length + index;
                mask![offset] =
                    part[index] ^
                    seed[offset] ^
                    ((group * 41 + index * 7) & 0xff);
            }
        });
        break;
    }

    if (!mask || !buildId) {
        throw new Error('AllAnime client encryption data was not found');
    }

    let bootstrap = rawBootstrap ? asRecord(JSON.parse(rawBootstrap)) : null;
    if (!bootstrap) {
        const now = Date.now();
        const epoch = Math.floor(now / bootstrapEpochLength);
        const epochs =
            now - epoch * bootstrapEpochLength < bootstrapGraceLength
                ? [epoch - 1, epoch]
                : [epoch];
        let status = 0;

        for (const candidate of epochs) {
            const secret = createHmac('sha256', mask)
                .update(`aa-boot:${buildId}`)
                .digest();
            const token = createHmac('sha256', secret)
                .update(
                    `${buildId}:mkissa:mkissa.to:${candidate}:${streamContentLane}`,
                )
                .digest('hex');
            const response = await fetch(
                new URL(
                    `/client-crypto/v1/bootstrap?buildId=${encodeURIComponent(buildId)}&k=${streamContentLane}`,
                    endpoint,
                ),
                {
                    headers: {
                        Origin: origin,
                        Referer: `${origin}/`,
                        'User-Agent': userAgent,
                        'x-aa-boot': token,
                        'x-build-id': buildId,
                    },
                    signal: AbortSignal.timeout(10_000),
                },
            );
            status = response.status;
            if (!response.ok) continue;

            bootstrap = asRecord(await response.json());
            if (bootstrap) break;
        }

        if (!bootstrap) {
            throw new Error(`AllAnime bootstrap failed (${status})`);
        }
    }

    const epoch = Number(bootstrap.epoch);
    const part = Buffer.from(String(bootstrap.partB ?? ''), 'base64');
    if (
        !Number.isSafeInteger(epoch) ||
        part.length !== 32 ||
        (bootstrap.k && bootstrap.k !== streamContentLane)
    ) {
        throw new Error('AllAnime bootstrap data was invalid');
    }

    const key = Buffer.alloc(32);
    for (let index = 0; index < key.length; index++) {
        key[index] = part[index] ^ mask[index];
    }

    cachedStreamCrypto = {
        buildId,
        epoch,
        key,
        refreshAt: Math.min(
            Date.now() + 300_000,
            Number(bootstrap.switchAt) || Number.POSITIVE_INFINITY,
        ),
    };
    return cachedStreamCrypto;
}

function aaLease(crypto: StreamCrypto, queryHash: string) {
    const timestamp = Math.floor(Date.now() / 300_000) * 300_000;
    const iv = createHash('sha256')
        .update(
            `${crypto.epoch}:${crypto.buildId}:${queryHash}:${timestamp}:${streamContentLane}`,
        )
        .digest()
        .subarray(0, 12);
    const payload = JSON.stringify({
        v: 1,
        ts: timestamp,
        epoch: crypto.epoch,
        buildId: crypto.buildId,
        qh: queryHash,
        k: streamContentLane,
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

interface MediaReference {
    url: string;
    quality: string | null;
}

async function responsePrefix(response: Response, limit: number) {
    const reader = response.body?.getReader();
    if (!reader) return new Uint8Array();

    const chunks: Uint8Array[] = [];
    let length = 0;

    try {
        while (length < limit) {
            const { done, value } = await reader.read();
            if (done) break;

            const remaining = limit - length;
            const chunk =
                value.length > remaining
                    ? value.subarray(0, remaining)
                    : value;
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

async function streamAudioDelay(target: string) {
    const host = new URL(target).hostname;
    const response = await fetch(target, {
        headers: {
            Range: 'bytes=0-2097151',
            Referer: host.endsWith('.mp4upload.com')
                ? 'https://www.mp4upload.com'
                : referer,
            'User-Agent': userAgent,
        },
        signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok && response.status !== 206) return 0;

    return audioDelayFromMp4(await responsePrefix(response, 2_097_152));
}

function streamQuality(value: unknown) {
    const match = String(value ?? '').match(/^(\d{3,4})p?$/i);
    return match ? `${Number(match[1])}p` : null;
}

function mediaReferences(
    value: unknown,
    inheritedQuality: string | null = null,
): MediaReference[] {
    if (typeof value === 'string') {
        return /^https?:\/\//.test(value)
            ? [{ url: value, quality: inheritedQuality }]
            : [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((child) =>
            mediaReferences(child, inheritedQuality),
        );
    }

    const object = asRecord(value);
    if (!object) return [];

    const quality =
        streamQuality(object.resolutionStr) ??
        streamQuality(object.resolution) ??
        streamQuality(object.quality) ??
        inheritedQuality;

    return Object.entries(object).flatMap(([key, child]) => {
        if (['link', 'url', 'file', 'src'].includes(key.toLowerCase())) {
            return mediaReferences(child, quality);
        }

        return typeof child === 'object'
            ? mediaReferences(child, quality)
            : [];
    });
}

function wixStreams(target: string): AllAnimeStream[] {
    const match = target.match(
        /^https:\/\/repackager\.wixmp\.com\/(video\.wixstatic\.com\/.+?)\/,([^/]+),\/(.+?)\.urlset(?:\/.*)?$/,
    );
    if (!match) return [];

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

async function resolveTargets(
    target: string,
    quality: string | null = null,
    depth = 0,
): Promise<AllAnimeStream[]> {
    if (depth > 4) return [];

    const wix = wixStreams(target);
    if (wix.length) return wix;

    const url = new URL(target);
    const host = url.hostname.toLowerCase();
    const directHost =
        host === 'tools.fast4speed.rsvp' ||
        host.endsWith('.sharepoint.com');

    if (directHost || /\.mp4(?:[?#]|$)/i.test(url.pathname)) {
        const pathQuality = url.pathname.match(
            /(?:^|\/)(\d{3,4})p(?:\/|$)/i,
        )?.[1];
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

    if (!response.ok) return [];

    const text = await response.text();
    try {
        const references = mediaReferences(JSON.parse(text), quality).filter(
            ({ url }) => url !== target,
        );
        const streams = await Promise.all(
            references.map((reference) =>
                resolveTargets(
                    reference.url,
                    reference.quality,
                    depth + 1,
                ).catch(() => []),
            ),
        );
        return streams.flat();
    } catch {
        const embedded = text.match(/src:\s*["']([^"']+)["']/)?.[1];
        return embedded
            ? resolveTargets(
                  new URL(embedded, target).toString(),
                  quality,
                  depth + 1,
              )
            : [];
    }
}

async function encryptedSources(
    showId: string,
    episode: string,
    translationType: AudioMode,
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
            k: streamContentLane,
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
        signal: AbortSignal.timeout(6_000),
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

async function resolveStreams(
    anime: AniListAnime,
    episode: string,
    translationTypes: AudioMode[],
) {
    const showId = await findShowId(anime);
    let crypto = await getStreamCrypto();
    const errors: unknown[] = [];
    const streams: AllAnimeStreams = {};
    const loadSources = (translationType: AudioMode) =>
        encryptedSources(showId, episode, translationType, crypto).then(
            (sources) => ({ translationType, sources, error: null }),
            (error: unknown) => ({
                translationType,
                sources: null,
                error,
            }),
        );
    let sourceResults = await Promise.all(translationTypes.map(loadSources));

    if (
        sourceResults.some(
            ({ error }) =>
                error instanceof Error &&
                error.message.includes('AA_CRYPTO'),
        )
    ) {
        crypto = await getStreamCrypto(true);
        sourceResults = await Promise.all(
            sourceResults.map((result) =>
                result.error instanceof Error &&
                result.error.message.includes('AA_CRYPTO')
                    ? loadSources(result.translationType)
                    : result,
            ),
        );
    }

    await Promise.all(
        sourceResults.map(async ({ translationType, sources, error }) => {
            if (!sources) {
                errors.push(error);
                return;
            }

            const priority = ['default', 's-mp4', 'yt-mp4', 'mp4'];
            const ordered = sources.toSorted((left, right) => {
                const rank = (source: Source) => {
                    const index = priority.indexOf(
                        source.name.toLowerCase(),
                    );
                    return index < 0 ? priority.length : index;
                };

                return rank(left) - rank(right);
            });
            const supported = ordered.filter((source) =>
                priority.includes(source.name.toLowerCase()),
            );
            const resolved = (
                await Promise.all(
                    (supported.length ? supported : ordered).map((source) => {
                        const decoded = decodeSourceUrl(source.url);
                        const target = /^https?:\/\//.test(decoded)
                            ? decoded
                            : `${site}${decoded.startsWith('/') ? '' : '/'}${decoded}`;
                        return resolveTargets(target).catch(() => []);
                    }),
                )
            )
                .flat()
                .filter(
                    (stream, index, values) =>
                        values.findIndex(({ url }) => url === stream.url) ===
                        index,
                )
                .toSorted(
                    (left, right) =>
                        Number.parseInt(right.quality ?? '0') -
                        Number.parseInt(left.quality ?? '0'),
                );

            if (resolved.length) {
                const audioDelay =
                    translationType === 'dub'
                        ? await streamAudioDelay(resolved[0].url).catch(() => 0)
                        : 0;
                streams[translationType] = resolved.map((stream) => ({
                    ...stream,
                    audioDelay,
                }));
            }

            if (streams[translationType]) return;

            errors.push(
                new Error(
                    `AllAnime ${translationType} sources could not be resolved: ${ordered
                        .map(({ name, url }) => `${name} (${url})`)
                        .join(', ')}`,
                ),
            );
        }),
    );

    if (Object.keys(streams).length) return streams;

    throw new AggregateError(
        errors,
        `AllAnime returned no playable source for episode ${episode}`,
    );
}

async function getStreams(
    anime: AniListAnime,
    episode: string,
    translationTypes: AudioMode[],
) {
    const key = `${anime.id}:${episode}:${translationTypes.toSorted().join(',')}`;
    const cached = streamCache.get(key);
    if (cached && Date.now() < cached.expiresAt) return cached.streams;

    const pending = streamRequests.get(key);
    if (pending) return pending;

    const request = resolveStreams(anime, episode, translationTypes);
    streamRequests.set(key, request);

    try {
        const streams = await request;
        streamCache.set(key, {
            streams,
            expiresAt: Date.now() + 300_000,
        });
        return streams;
    } finally {
        streamRequests.delete(key);
    }
}

export const allanime = { getEpisodes, getPopularAudioLabels, getStreams };
