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
import {
    createCipheriv,
    createDecipheriv,
    createHash,
} from 'node:crypto';

type AniListAnime = NonNullable<AnimeQuery['Media']>;

const endpoint = 'https://api.allanime.day/api';
const site = 'https://allanime.day';
const referer = 'https://youtu-chan.com';
const origin = 'https://mkissa.to';
const streamCrypto = {
    buildId: '63',
    epoch: 6884,
    key: Buffer.from(
        'f34fa715e2958b8c1ebc6efa4d089acd8f196d8b83d4b6201586c00c8a52e4a8',
        'hex',
    ),
    queryHash:
        'f4662f4b7510b26795dd53ef824a0bf1740fbbc5d1273fab18222ac831bca8d0',
};
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';

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
                Referer: 'https://youtu-chan.com',
                'User-Agent': userAgent,
            },
        }),
    );
}

function episodeDetail(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { sub: [], dub: [], raw: [] };
    }

    const record = value as Record<string, unknown>;
    const strings = (key: string) =>
        Array.isArray(record[key])
            ? record[key].filter((item): item is string => typeof item === 'string')
            : [];

    return { sub: strings('sub'), dub: strings('dub'), raw: strings('raw') };
}

function titlesFor(anime: AniListAnime) {
    return [
        anime.title?.english,
        anime.title?.romaji,
        anime.title?.native,
        ...(anime.synonyms ?? []),
    ].filter(
        (title, index, titles): title is string =>
            Boolean(title?.trim()) && titles.indexOf(title) === index,
    );
}

async function findShowId(anime: AniListAnime) {
    if (!anime.idMal) throw new Error(`AniList ${anime.id} has no MAL ID`);

    for (const translationType of ['sub', 'dub'] as const) {
        for (const query of titlesFor(anime)) {
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

function plainText(value: string | null | undefined) {
    return (value ?? '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function episodeLabel(id: string) {
    const value = Number(id);

    return Number.isInteger(value) ? `E${value}` : `E${id}`;
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

    const detail = episodeDetail(data.show.availableEpisodesDetail);
    const sub = new Set([...(detail.sub ?? []), ...(detail.raw ?? [])]);
    const dub = new Set(detail.dub ?? []);
    const titles = new Map(
        (data.episodeInfos ?? []).flatMap((episode) => {
            const id = String(episode.episodeIdNum ?? '').trim();
            const title = plainText(episode.notes);

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
                    label: episodeLabel(id),
                    title: titles.get(id) ?? '',
                    hasSub: sub.has(id),
                    hasDub: dub.has(id),
                },
            ];
        })
        .sort((left, right) => left.number - right.number);
}

function aaLease() {
    const timestamp = Math.floor(Date.now() / 300_000) * 300_000;
    const iv = createHash('sha256')
        .update(
            `${streamCrypto.epoch}:${streamCrypto.buildId}:${streamCrypto.queryHash}:${timestamp}`,
        )
        .digest()
        .subarray(0, 12);
    const payload = JSON.stringify({
        v: 1,
        ts: timestamp,
        epoch: streamCrypto.epoch,
        buildId: streamCrypto.buildId,
        qh: streamCrypto.queryHash,
    });
    const cipher = createCipheriv('aes-256-gcm', streamCrypto.key, iv);
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

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function decryptedPayload(value: string) {
    const encrypted = Buffer.from(value, 'base64');

    if (encrypted.length < 30 || encrypted[0] !== 1) {
        throw new Error('AllAnime returned an invalid encrypted payload');
    }

    const iv = encrypted.subarray(1, 13);
    const tag = encrypted.subarray(-16);
    const decipher = createDecipheriv('aes-256-gcm', streamCrypto.key, iv);
    decipher.setAuthTag(tag);

    return JSON.parse(
        Buffer.concat([
            decipher.update(encrypted.subarray(13, -16)),
            decipher.final(),
        ]).toString('utf8'),
    ) as unknown;
}

interface SourceReference {
    sourceName: string;
    sourceUrl: string;
}

function sourceReferences(value: unknown): SourceReference[] {
    const root = record(value);
    const data = record(root?.data) ?? root;
    const episode = record(data?.episode) ?? data;
    const urls = episode?.sourceUrls;

    if (!Array.isArray(urls)) return [];

    return urls.flatMap((value) => {
        const source = record(value);
        const sourceName = source?.sourceName;
        const sourceUrl = source?.sourceUrl;

        return typeof sourceName === 'string' && typeof sourceUrl === 'string'
            ? [{ sourceName, sourceUrl }]
            : [];
    });
}

const substitutions: Record<string, string> = {
    '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G', '70': 'H', '71': 'I', '72': 'J', '73': 'K', '74': 'L', '75': 'M', '76': 'N', '77': 'O',
    '68': 'P', '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T', '6d': 'U', '6e': 'V', '6f': 'W', '60': 'X', '61': 'Y', '62': 'Z',
    '59': 'a', '5a': 'b', '5b': 'c', '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g', '50': 'h', '51': 'i', '52': 'j', '53': 'k', '54': 'l', '55': 'm', '56': 'n', '57': 'o',
    '48': 'p', '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u', '4e': 'v', '4f': 'w', '40': 'x', '41': 'y', '42': 'z',
    '08': '0', '09': '1', '0a': '2', '0b': '3', '0c': '4', '0d': '5', '0e': '6', '0f': '7', '00': '8', '01': '9',
    '15': '-', '16': '.', '67': '_', '46': '~', '02': ':', '17': '/', '07': '?', '1b': '#', '63': '[', '65': ']', '78': '@', '19': '!', '1c': '$', '1e': '&', '10': '(', '11': ')', '12': '*', '13': '+', '14': ',', '03': ';', '05': '=', '1d': '%',
};

function decodeSourceUrl(value: string) {
    if (!value.startsWith('--')) return value;

    const encoded = value.slice(2);
    let decoded = '';

    for (let index = 0; index < encoded.length; index += 2) {
        const pair = encoded.slice(index, index + 2);
        decoded += substitutions[pair] ?? pair;
    }

    return decoded.replace('/clock', '/clock.json');
}

function mediaUrls(value: unknown): string[] {
    if (typeof value === 'string') {
        return /^https?:\/\//.test(value) ? [value] : [];
    }
    if (Array.isArray(value)) return value.flatMap(mediaUrls);

    const object = record(value);
    if (!object) return [];

    return Object.entries(object).flatMap(([key, child]) =>
        ['link', 'url', 'file', 'src'].includes(key.toLowerCase())
            ? mediaUrls(child)
            : typeof child === 'object'
              ? mediaUrls(child)
              : [],
    );
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
            const rank = (candidate: string) =>
                /\.mp4(?:[?#]|$)/i.test(candidate)
                    ? 0
                    : candidate.includes('tools.fast4speed.rsvp')
                      ? 1
                      : /\.m3u8(?:[?#]|$)/i.test(candidate)
                        ? 2
                        : 3;

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

async function resolveSource(source: SourceReference) {
    const decoded = decodeSourceUrl(source.sourceUrl);
    const target = /^https?:\/\//.test(decoded)
        ? decoded
        : `${site}${decoded.startsWith('/') ? '' : '/'}${decoded}`;

    return resolveTarget(target);
}

async function encryptedSources(
    showId: string,
    episode: string,
    translationType: 'sub' | 'dub',
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
                sha256Hash: streamCrypto.queryHash,
            },
            aaReq: aaLease(),
        }),
    );

    const response = await fetch(url, {
        headers: {
            Origin: origin,
            Referer: referer,
            'User-Agent': userAgent,
            'x-build-id': streamCrypto.buildId,
        },
    });
    const payload = (await response.json()) as unknown;
    const root = record(payload);
    const data = record(root?.data);
    const episodeData = record(data?.episode);
    const encrypted = data?.tobeparsed ?? episodeData?.tobeparsed;

    if (typeof encrypted === 'string') {
        return sourceReferences(decryptedPayload(encrypted));
    }

    const sources = sourceReferences(payload);
    if (sources.length) return sources;

    const message = Array.isArray(root?.errors)
        ? record(root.errors[0])?.message
        : null;
    throw new Error(
        typeof message === 'string'
            ? `AllAnime: ${message}`
            : 'AllAnime returned no episode sources',
    );
}

async function getStream(anime: AniListAnime, episode: string) {
    const showId = await findShowId(anime);

    for (const translationType of ['sub', 'dub'] as const) {
        try {
            const sources = await encryptedSources(
                showId,
                episode,
                translationType,
            );
            const ordered = sources.toSorted((left, right) => {
                const priority = ['yt-mp4', 's-mp4', 'default', 'mp4'];
                const rank = (source: SourceReference) => {
                    const index = priority.indexOf(source.sourceName.toLowerCase());
                    return index < 0 ? priority.length : index;
                };

                return rank(left) - rank(right);
            });

            for (const source of ordered) {
                const url = await resolveSource(source).catch(() => null);
                if (url) return url;
            }
        } catch {
            // Try the other translation before reporting no stream.
        }
    }

    throw new Error(`AllAnime returned no playable source for episode ${episode}`);
}

export const allanime = { getEpisodes, getStream };
