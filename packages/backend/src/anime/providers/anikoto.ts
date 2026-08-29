import { and, eq, isNull, or } from 'drizzle-orm';
import { load } from 'cheerio';
import { z } from 'zod';

import { audioAvailabilityLabel, type AudioMode } from '@arc/shared/audio';
import type { AnimeSeasonSelection } from '@arc/shared/season';
import type { AnimeCard } from '@arc/shared/types';
import { animeTitles, plainText } from '../anilist/text';
import type { AniListAnime } from '../anilist/types';
import type { JsonValue } from '../../utils';
import type {
    PlaybackProvider,
    ProviderEpisode,
    ProviderEpisodeReference,
    ProviderStream,
    ProviderStreams,
} from './types';
import { normalizedProviderTitle } from './match';

const anikotoUrl = 'https://anikototv.to';
const catalogUrl = 'https://anikotoapi.site';
const providerName = 'anikoto';
const mediaHostSuffixes = [
    'akirax.buzz',
    'kryntal.top',
    'lostproject.club',
    'megaplay.buzz',
    'mikora.top',
    'norami.top',
    'shiora.site',
    'shiora.top',
    'tiktokcdn.com',
    'watching.onl',
] as const;
export const aniKotoRequestTimeoutMs = 10_000;
export const aniKotoMediaReferer = 'https://megaplay.buzz/';
export const aniKotoStreamLimits = {
    playlist: 2 * 1024 * 1024,
    subtitle: 512 * 1024,
    segment: 64 * 1024 * 1024,
} as const;
const resolutionDeadlineMs = 30_000;
const resolutionConcurrency = 4;
const mediaRetryCount = 2;
const requestRetryCount = 2;
const defaultRequestRetryDelayMs = 500;
const maxRequestRetryDelayMs = 10_000;
const failedSourceCooldownMs = 30_000;
const maxTextBytes = 2 * 1024 * 1024;
const failedSources = new Map<string, number>();

const ajaxResponseSchema = z.object({ status: z.number().int(), result: z.string() });
const seriesResponseSchema = z.object({
    ok: z.boolean(),
    data: z
        .object({
            anime: z.object({
                id: z.union([z.number(), z.string()]),
                ani_id: z.union([z.number(), z.string()]).nullish(),
                mal_id: z.union([z.number(), z.string()]).nullish(),
                title: z.string(),
                alternative: z.string().nullish(),
                poster: z.string().nullish(),
                description: z.string().nullish(),
                score: z.union([z.number(), z.string()]).nullish(),
                is_sub: z.union([z.number(), z.string()]).nullish(),
                is_dub: z.union([z.number(), z.string()]).nullish(),
                status: z.string().nullish(),
                terms_by_type: z
                    .object({
                        genre: z.array(z.string()).optional(),
                        type: z.array(z.string()).optional(),
                    })
                    .nullish(),
            }),
            episodes: z.array(
                z.object({
                    number: z.union([z.number(), z.string()]),
                    title: z.string(),
                    episode_embed_id: z.string(),
                })
            ),
        })
        .optional(),
});
const serverResponseSchema = z.object({
    status: z.number().int(),
    result: z.object({ url: z.string() }).loose(),
});
const sourcePayloadSchema = z.object({
    sources: z.object({ file: z.string().trim().min(1) }),
    tracks: z
        .array(
            z.object({
                file: z.string().trim().min(1),
                label: z.string(),
                kind: z.string(),
                default: z.boolean().optional(),
            })
        )
        .optional(),
});
type AniKotoServerMode = Exclude<AudioMode, 'raw'> | 'hsub';

interface AniKotoSeries {
    id: number;
    anilistId: number | null;
    malId: number | null;
    title: string;
    alternativeTitle: string;
    image: string | null;
    synopsis: string;
    score: number;
    genres: string[];
    format: string | null;
    status: string | null;
    audio: AudioMode[];
}

interface SearchCandidate {
    id: number;
    title: string;
    alternativeTitle: string;
}

const episodeRoutePrefix = 'anikoto:';

export function aniKotoEpisodeRoute(seriesId: number, episodeId: string) {
    return `${episodeRoutePrefix}${seriesId}:${encodeURIComponent(episodeId)}`;
}

export function parseAniKotoEpisodeRoute(value: string) {
    if (!value.startsWith(episodeRoutePrefix)) {
        return null;
    }

    const match = value.match(/^anikoto:(\d+):(.+)$/);
    if (!match) {
        return null;
    }

    const seriesId = positiveId(match[1]);
    if (!seriesId) {
        return null;
    }

    try {
        const episodeId = decodeURIComponent(match[2]);
        return validOpaqueId(episodeId) ? { seriesId, episodeId } : null;
    } catch {
        return null;
    }
}

export interface AniKotoServerCandidate {
    mode: Exclude<AudioMode, 'raw'>;
    embedMode: AniKotoServerMode;
    linkId: string;
    label: string;
}

interface CaptionCandidate {
    url: string;
    kind: 'full' | 'sdh' | 'forced';
    preferred: boolean;
}

class AniKotoRequestError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message);
    }
}

class AniKotoSubtitlesError extends Error {
    constructor(readonly mediaUrl: string) {
        super('AniKoto SUB source returned no subtitles');
    }
}

function positiveId(value: JsonValue | undefined) {
    const parsed = z.union([z.number().int(), z.string().regex(/^\d+$/)]).safeParse(value);
    if (!parsed.success) {
        return null;
    }

    const number = Number(parsed.data);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function supportedHost(hostname: string) {
    return mediaHostSuffixes.some(
        (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
    );
}

export function sourceCooldownKey(url: URL) {
    return url.toString();
}

function retryAfterMs(value: string | null) {
    if (!value) {
        return null;
    }

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(maxRequestRetryDelayMs, Math.ceil(seconds * 1000));
    }

    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
        ? Math.min(maxRequestRetryDelayMs, Math.max(0, timestamp - Date.now()))
        : null;
}

function retryableRequestStatus(status: number) {
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function abortPromise(signal?: AbortSignal) {
    if (!signal) {
        return new Promise<void>(() => undefined);
    }
    if (signal.aborted) {
        return Promise.reject(signal.reason);
    }
    return new Promise<never>((_, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    );
}

async function abortableDelay(delay: number, signal?: AbortSignal) {
    await Promise.race([
        new Promise<void>((resolve) => setTimeout(resolve, delay)),
        abortPromise(signal),
    ]);
}

function requestRetryDelay(response: Response, attempt: number) {
    return (
        retryAfterMs(response.headers.get('retry-after')) ??
        Math.min(maxRequestRetryDelayMs, defaultRequestRetryDelayMs * 2 ** attempt)
    );
}

function sourceIsCoolingDown(url: URL) {
    const key = sourceCooldownKey(url);
    const retryAt = failedSources.get(key);
    if (retryAt === undefined) {
        return false;
    }
    if (retryAt <= Date.now()) {
        failedSources.delete(key);
        return false;
    }
    return true;
}

function rememberFailedSource(url: URL) {
    failedSources.set(sourceCooldownKey(url), Date.now() + failedSourceCooldownMs);
}

function retryableMediaError(cause: unknown) {
    if (cause instanceof AniKotoRequestError) {
        return false;
    }

    if (cause instanceof DOMException && ['AbortError', 'TimeoutError'].includes(cause.name)) {
        return false;
    }

    const error = cause as { code?: unknown; cause?: { code?: unknown }; message?: unknown };
    const code = error.code ?? error.cause?.code;
    return (
        code === 'ECONNRESET' ||
        code === 'ECONNREFUSED' ||
        code === 'EPIPE' ||
        code === 'ETIMEDOUT' ||
        /socket connection was closed|network connection was lost/i.test(String(error.message))
    );
}

export function supportedAniKotoHost(hostname: string) {
    return supportedHost(hostname);
}

export function isAniKotoDisguisedSegmentHost(hostname: string) {
    return (
        /^p\d+-ad-site-sign-sg\.tiktokcdn\.com$/.test(hostname) ||
        /^s\d+\.(?:akirax\.buzz|norami\.top|shiora\.site|shiora\.top)$/.test(hostname)
    );
}

export function unwrapAniKotoDisguisedSegment(value: Uint8Array) {
    const pngEnd = new Uint8Array([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
    for (let index = 0; index <= value.length - pngEnd.length; index += 1) {
        if (pngEnd.every((byte, offset) => value[index + offset] === byte)) {
            return value.slice(index + pngEnd.length);
        }
    }

    if (value[0] === 0xff && value[1] === 0xd8) {
        for (let index = 1; index < value.length; index += 1) {
            if (value[index - 1] === 0xff && value[index] === 0xd9) {
                return value.slice(index + 1);
            }
        }
    }

    return value;
}

export function normalizeAniKotoMediaUrl(url: URL) {
    if (
        !url ||
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        !supportedHost(url.hostname)
    ) {
        return null;
    }

    const normalized = new URL(url.toString());
    const shard = normalized.hostname.match(/^(s\d+)\.shiora\.(?:site|top)$/i)?.[1];
    if (shard) {
        normalized.hostname = `${shard}.akirax.buzz`;
    }
    return normalized;
}

export function aniKotoMediaCandidates(url: URL) {
    const candidates = [url];
    if (url.hostname.endsWith('.shiora.top')) {
        const alternate = new URL(url);
        alternate.hostname = alternate.hostname.replace(/\.shiora\.top$/, '.shiora.site');
        candidates.push(alternate);
    }
    if (url.hostname === 'cdn.kryntal.top' || url.hostname === 'ncdn.kryntal.top') {
        for (const prefix of ['cdn', 'ncdn']) {
            const alternate = new URL(url);
            alternate.hostname = `${prefix}.watching.onl`;
            if (!candidates.some((candidate) => candidate.hostname === alternate.hostname)) {
                candidates.push(alternate);
            }
        }
    }
    return candidates;
}

function validHttpsUrl(value: string | undefined) {
    if (!value?.trim()) {
        return null;
    }

    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.port) {
            return null;
        }
        return url;
    } catch {
        return null;
    }
}

export function supportedMediaUrl(value: string) {
    const url = validHttpsUrl(value);
    const normalized = url ? normalizeAniKotoMediaUrl(url) : null;
    if (!normalized) {
        return null;
    }

    return /\.(?:m3u8|mp4)$/i.test(normalized.pathname) ? normalized : null;
}

export function supportedSubtitleUrl(value: string) {
    const url = validHttpsUrl(value);
    const normalized = url ? normalizeAniKotoMediaUrl(url) : null;
    if (!normalized || !/\.vtt$/i.test(normalized.pathname)) {
        return null;
    }

    return normalized;
}

export function validOpaqueId(value: string | undefined, maxLength = 1024) {
    return value && value.length > 0 && value.length <= maxLength ? value : null;
}

export function episodeAudioModes(sub: string | undefined, dub: string | undefined): AudioMode[] {
    return [...(sub === '1' ? (['sub'] as const) : []), ...(dub === '1' ? (['dub'] as const) : [])];
}

export function playableAudioModes(
    available: readonly AudioMode[],
    requested: readonly AudioMode[]
): Exclude<AudioMode, 'raw'>[] {
    const availableModes = new Set(available);
    return [...new Set(requested)].filter(
        (mode): mode is Exclude<AudioMode, 'raw'> => mode !== 'raw' && availableModes.has(mode)
    );
}

export function serverMode(value: string | undefined): AniKotoServerMode | null {
    return value === 'sub' || value === 'dub' || value === 'hsub' ? value : null;
}

export function parseSeries(value: JsonValue): AniKotoSeries | null {
    const parsed = seriesResponseSchema.safeParse(value);
    if (!parsed.success || !parsed.data.ok || !parsed.data.data) {
        return null;
    }

    const id = positiveId(parsed.data.data.anime.id);
    if (!id) {
        return null;
    }

    const anime = parsed.data.data.anime;
    const score = Number(anime.score);
    const modes: AudioMode[] = [
        ...(Number(anime.is_sub) > 0 ? (['sub'] as const) : []),
        ...(Number(anime.is_dub) > 0 ? (['dub'] as const) : []),
    ];

    return {
        id,
        anilistId: positiveId(anime.ani_id),
        malId: positiveId(anime.mal_id),
        title: anime.title.trim(),
        alternativeTitle: anime.alternative?.trim() ?? '',
        image: validHttpsUrl(anime.poster ?? undefined)?.toString() ?? null,
        synopsis: plainText(anime.description),
        score: Number.isFinite(score) && score >= 0 ? Math.min(100, Math.round(score * 10)) : 0,
        genres: [
            ...new Set(anime.terms_by_type?.genre?.map((genre) => genre.trim()).filter(Boolean)),
        ],
        format: anime.terms_by_type?.type?.find((format) => format.trim())?.trim() ?? null,
        status:
            {
                'currently airing': 'RELEASING',
                'finished airing': 'FINISHED',
                'not yet aired': 'NOT_YET_RELEASED',
            }[anime.status?.trim().toLowerCase() ?? ''] ?? null,
        audio: modes,
    };
}

export function matchesAniKotoIdentity(
    series: Pick<AniKotoSeries, 'anilistId' | 'malId'>,
    anime: Pick<AniListAnime, 'id' | 'idMal'>
) {
    if (series.anilistId === anime.id) {
        return true;
    }

    const duplicatedMalId = series.anilistId !== null && series.anilistId === series.malId;
    if (series.anilistId === null || duplicatedMalId) {
        return Boolean(anime.idMal && series.malId !== null && series.malId === anime.idMal);
    }

    return false;
}

export function parseSearchCandidates(html: string) {
    const $ = load(html);
    const candidates = new Map<number, SearchCandidate>();

    $('.item').each((_, element) => {
        const item = $(element);
        const id = positiveId(item.find('.poster[data-tip]').first().attr('data-tip'));
        const titleElement = item.find('.name').first();
        const title = titleElement.text().trim();
        const alternativeTitle = titleElement.attr('data-jp')?.trim() ?? '';

        if (id && title) {
            candidates.set(id, { id, title, alternativeTitle });
        }
    });

    return [...candidates.values()];
}

export function parseAniKotoCatalogPage(html: string) {
    const $ = load(html);
    const providerIds = new Set<number>();

    $('#list-items > .item').each((_, element) => {
        const item = $(element);
        if (item.find('.adult').length) {
            return;
        }

        const id = positiveId(item.find('.poster[data-tip]').first().attr('data-tip'));
        if (id) {
            providerIds.add(id);
        }
    });

    return {
        providerIds: [...providerIds],
        hasNextPage: $('.pagination a[rel="next"]').length > 0,
    };
}

export function parseEpisodeList(value: JsonValue) {
    const parsed = ajaxResponseSchema.safeParse(value);
    if (!parsed.success || parsed.data.status !== 200) {
        return [];
    }

    const $ = load(parsed.data.result);
    const episodes = new Map<number, ProviderEpisode>();
    $('a[data-ids][data-num]').each((_, element) => {
        const link = $(element);
        const id = validOpaqueId(link.attr('data-ids')?.trim(), 512);
        const number = Number(link.attr('data-num'));
        const audio = episodeAudioModes(link.attr('data-sub'), link.attr('data-dub'));

        if (id && Number.isFinite(number) && number > 0 && audio.length > 0) {
            episodes.set(number, {
                id,
                number,
                title:
                    link.find('.d-title').text().trim() ||
                    link.parent().attr('title')?.trim() ||
                    '',
                audio,
            });
        }
    });

    return [...episodes.values()].sort((left, right) => left.number - right.number);
}

export function parseServerList(value: JsonValue) {
    const parsed = ajaxResponseSchema.safeParse(value);
    const servers = {
        sub: [] as AniKotoServerCandidate[],
        dub: [] as AniKotoServerCandidate[],
    };
    const seenByMode = { sub: new Set<string>(), dub: new Set<string>() };
    if (!parsed.success || parsed.data.status !== 200) {
        return servers;
    }

    const $ = load(parsed.data.result);
    $('.type[data-type]').each((_, element) => {
        const embedMode = serverMode($(element).attr('data-type'));
        if (!embedMode) {
            return;
        }
        const mode = embedMode === 'hsub' ? 'sub' : embedMode;

        $(element)
            .find('li[data-link-id]')
            .each((_, server) => {
                const item = $(server);
                const linkId = item.attr('data-link-id')?.trim() ?? '';
                if (validOpaqueId(linkId) && !seenByMode[mode].has(linkId)) {
                    seenByMode[mode].add(linkId);
                    servers[mode].push({
                        mode,
                        embedMode,
                        linkId,
                        label: item.text().trim() || mode.toUpperCase(),
                    });
                }
            });
    });

    return servers;
}

export function parseMegaPlaySourceId(html: string) {
    const $ = load(html);
    const dataId = $('[data-id]')
        .map((_, element) => $(element).attr('data-id'))
        .get()
        .find((value) => Boolean(value && /^\d+$/.test(value)));
    const id = dataId ?? html.match(/<title>\s*File\s+(\d+)\s*-/i)?.[1];
    return positiveId(id) ? id : null;
}

export function parseMegaPlaySource(value: JsonValue) {
    const parsed = sourcePayloadSchema.safeParse(value);
    if (!parsed.success) {
        return null;
    }

    const mediaUrl = supportedMediaUrl(parsed.data.sources.file);
    if (!mediaUrl) {
        return null;
    }

    const captions: CaptionCandidate[] = [];
    for (const track of parsed.data.tracks ?? []) {
        if (track.kind.toLowerCase() !== 'captions' || !/\b(?:eng|english)\b/i.test(track.label)) {
            continue;
        }

        const url = supportedSubtitleUrl(track.file);
        if (url && !captions.some((candidate) => candidate.url === url.toString())) {
            const label = track.label.toLowerCase();
            const kind = /forced/.test(label)
                ? 'forced'
                : /sdh|cc|hearing impaired/.test(label)
                  ? 'sdh'
                  : 'full';
            captions.push({ url: url.toString(), kind, preferred: track.default === true });
        }
    }

    captions.sort(
        (left, right) =>
            Number(right.preferred) - Number(left.preferred) ||
            ['full', 'sdh', 'forced'].indexOf(left.kind) -
                ['full', 'sdh', 'forced'].indexOf(right.kind)
    );
    return { mediaUrl, captions };
}

export function uniqueDirectStreams(streams: readonly ProviderStream[]) {
    const seen = new Set<string>();
    return streams.filter((stream) => {
        const key = stream.url;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

export async function resolveCandidates<T, R>(
    candidates: readonly T[],
    resolve: (candidate: T, signal: AbortSignal) => Promise<R | null>,
    options: { concurrency?: number; signal?: AbortSignal } = {}
) {
    const controller = new AbortController();
    const signal = options.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal;
    const results: Array<R | null> = Array.from({ length: candidates.length }, () => null);
    const errors: unknown[] = [];
    let next = 0;
    const concurrency = Math.max(
        1,
        Math.min(options.concurrency ?? resolutionConcurrency, candidates.length)
    );

    const run = async () => {
        while (!signal.aborted) {
            const index = next;
            next += 1;
            if (index >= candidates.length) {
                return;
            }

            try {
                const result = await Promise.race([
                    resolve(candidates[index], signal),
                    new Promise<never>((_, reject) => {
                        if (signal.aborted) {
                            reject(signal.reason);
                            return;
                        }
                        signal.addEventListener('abort', () => reject(signal.reason), {
                            once: true,
                        });
                    }),
                ]);
                results[index] = result;
            } catch (cause) {
                if (!signal.aborted || cause !== signal.reason) {
                    errors.push(cause);
                }
            }
        }
    };

    await Promise.all(Array.from({ length: concurrency }, run));
    return { results, errors };
}

async function readBounded(response: Response, limit: number, signal?: AbortSignal) {
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > limit) {
        throw new Error('AniKoto response exceeded its size limit');
    }

    if (!response.body) {
        const text = await response.text();
        const bytes = new TextEncoder().encode(text);
        if (bytes.byteLength > limit) {
            throw new Error('AniKoto response exceeded its size limit');
        }
        return bytes;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const chunk = signal
                ? await Promise.race([
                      reader.read(),
                      new Promise<never>((_, reject) => {
                          if (signal.aborted) {
                              reject(signal.reason);
                              return;
                          }
                          signal.addEventListener('abort', () => reject(signal.reason), {
                              once: true,
                          });
                      }),
                  ])
                : await reader.read();
            if (chunk.done) {
                break;
            }
            size += chunk.value.byteLength;
            if (size > limit) {
                await reader.cancel();
                throw new Error('AniKoto response exceeded its size limit');
            }
            chunks.push(chunk.value);
        }
    } catch (cause) {
        await reader.cancel().catch(() => undefined);
        throw cause;
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

async function requestText(
    url: URL,
    options: { accept?: string; referer?: string; maxBytes?: number; signal?: AbortSignal } = {}
): Promise<string> {
    const headers = new Headers({
        Accept: options.accept ?? 'text/html',
        Referer: options.referer ?? `${anikotoUrl}/`,
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
    });
    if (options.accept === 'application/json') {
        headers.set('X-Requested-With', 'XMLHttpRequest');
    }

    for (let attempt = 0; ; attempt += 1) {
        const response = await fetch(url, {
            headers,
            signal: options.signal
                ? AbortSignal.any([options.signal, AbortSignal.timeout(aniKotoRequestTimeoutMs)])
                : AbortSignal.timeout(aniKotoRequestTimeoutMs),
        });
        if (!response.ok) {
            if (retryableRequestStatus(response.status) && attempt < requestRetryCount) {
                const delay = requestRetryDelay(response, attempt);
                await response.body?.cancel().catch(() => undefined);
                await abortableDelay(delay, options.signal);
                continue;
            }
            throw new AniKotoRequestError(
                `AniKoto returned ${response.status} for ${url.hostname}${url.pathname}`,
                response.status
            );
        }

        return new TextDecoder().decode(
            await readBounded(response, options.maxBytes ?? maxTextBytes, options.signal)
        );
    }
}

async function requestJson(url: URL, referer = `${anikotoUrl}/`, signal?: AbortSignal) {
    const text = await requestText(url, { accept: 'application/json', referer, signal });
    try {
        return z.json().parse(JSON.parse(text));
    } catch (cause) {
        throw new Error('AniKoto returned invalid JSON', { cause });
    }
}

async function providerMediaId(anilistId: number) {
    const [{ db }, schema] = await Promise.all([import('@arc/db'), import('@arc/db/schema')]);
    const [override] = await db
        .select({ id: schema.animeMappingOverride.externalId })
        .from(schema.animeMappingOverride)
        .where(
            and(
                eq(schema.animeMappingOverride.anilistId, anilistId),
                eq(schema.animeMappingOverride.kind, 'playback'),
                eq(schema.animeMappingOverride.provider, providerName),
                isNull(schema.animeMappingOverride.clearedAt),
                or(
                    eq(schema.animeMappingOverride.validationStatus, 'pending'),
                    eq(schema.animeMappingOverride.validationStatus, 'valid')
                )
            )
        )
        .limit(1);
    if (override) {
        return override.id;
    }

    const [stored] = await db
        .select({ id: schema.animeProviderMapping.providerMediaId })
        .from(schema.animeProviderMapping)
        .where(
            and(
                eq(schema.animeProviderMapping.anilistId, anilistId),
                eq(schema.animeProviderMapping.provider, providerName)
            )
        )
        .limit(1);
    return stored?.id ?? null;
}

async function saveProviderMediaId(anilistId: number, id: string) {
    const [{ db }, schema] = await Promise.all([import('@arc/db'), import('@arc/db/schema')]);
    const [override] = await db
        .select({ id: schema.animeMappingOverride.externalId })
        .from(schema.animeMappingOverride)
        .where(
            and(
                eq(schema.animeMappingOverride.anilistId, anilistId),
                eq(schema.animeMappingOverride.kind, 'playback'),
                eq(schema.animeMappingOverride.provider, providerName),
                isNull(schema.animeMappingOverride.clearedAt),
                or(
                    eq(schema.animeMappingOverride.validationStatus, 'pending'),
                    eq(schema.animeMappingOverride.validationStatus, 'valid')
                )
            )
        )
        .limit(1);
    if (override && override.id !== id) {
        return;
    }

    const now = new Date();
    await db
        .insert(schema.animeProviderMapping)
        .values({
            anilistId,
            provider: providerName,
            providerMediaId: id,
            discoveredAt: now,
            verifiedAt: now,
        })
        .onConflictDoUpdate({
            target: [schema.animeProviderMapping.anilistId, schema.animeProviderMapping.provider],
            set: { providerMediaId: id, verifiedAt: now },
        });
}

async function verifyProviderMediaId(anilistId: number) {
    const [{ db }, schema] = await Promise.all([import('@arc/db'), import('@arc/db/schema')]);
    await db
        .update(schema.animeProviderMapping)
        .set({ verifiedAt: new Date() })
        .where(
            and(
                eq(schema.animeProviderMapping.anilistId, anilistId),
                eq(schema.animeProviderMapping.provider, providerName)
            )
        );
}

async function loadSeries(id: number) {
    const series = parseSeries(await requestJson(new URL(`/series/${id}`, catalogUrl)));
    if (!series || series.id !== id) {
        throw new Error('AniKoto returned an invalid series response');
    }
    return series;
}

async function loadEpisodes(series: AniKotoSeries) {
    return parseEpisodeList(
        await requestJson(new URL(`/ajax/episode/list/${series.id}`, anikotoUrl))
    );
}

function relationTitles(anime: AniListAnime) {
    return (anime.relations?.edges ?? [])
        .filter((edge) => edge?.relationType === 'SEQUEL' && edge.node?.type === 'ANIME')
        .map((edge) => edge.node?.title)
        .flatMap((title) => (title ? [title.english, title.romaji, title.native] : []))
        .filter((title): title is string => Boolean(title?.trim()))
        .map(normalizedProviderTitle);
}

async function findRelatedSeries(anime: AniListAnime) {
    const titles = new Set(relationTitles(anime));
    const candidates = new Map<number, SearchCandidate>();
    for (const title of titles) {
        for (const candidate of await search(title).catch(() => [])) {
            candidates.set(candidate.id, candidate);
        }
    }

    const exactCandidates = [...candidates.values()].filter(
        (candidate) =>
            titles.has(normalizedProviderTitle(candidate.title)) ||
            titles.has(normalizedProviderTitle(candidate.alternativeTitle))
    );
    for (const candidate of exactCandidates) {
        const series = await loadSeries(candidate.id).catch(() => null);
        if (
            series &&
            (titles.has(normalizedProviderTitle(series.title)) ||
                titles.has(normalizedProviderTitle(series.alternativeTitle)))
        ) {
            return series;
        }
    }

    return null;
}

export function mergeAniKotoEpisodeRanges(
    primary: ProviderEpisode[],
    primarySeriesId: number,
    related: { episodes: ProviderEpisode[]; seriesId: number } | null,
    expected: number
) {
    const primaryEpisodes = primary.map((episode) => ({
        ...episode,
        id: aniKotoEpisodeRoute(primarySeriesId, episode.id),
    }));
    if (!related || expected <= primaryEpisodes.length) {
        return primaryEpisodes;
    }

    const offset = Math.max(...primary.map((episode) => episode.number), 0);
    return [
        ...primaryEpisodes,
        ...related.episodes.slice(0, expected - primaryEpisodes.length).map((episode) => ({
            ...episode,
            id: aniKotoEpisodeRoute(related.seriesId, episode.id),
            number: episode.number + offset,
        })),
    ];
}

async function episodesForAnime(anime: AniListAnime, series: AniKotoSeries) {
    const primary = await loadEpisodes(series);
    const expected = anime.episodes;
    if (!expected) {
        return mergeAniKotoEpisodeRanges(primary, series.id, null, Number.MAX_SAFE_INTEGER);
    }

    const related = await findRelatedSeries(anime);
    const secondary = related && related.id !== series.id ? await loadEpisodes(related) : null;
    return mergeAniKotoEpisodeRanges(
        primary,
        series.id,
        secondary ? { episodes: secondary, seriesId: related.id } : null,
        expected
    );
}

export async function getAniKotoSimulcastPage(selection: AnimeSeasonSelection, page: number) {
    if (!Number.isSafeInteger(page) || page <= 0) {
        throw new RangeError('AniKoto catalog page must be a positive integer');
    }

    const url = new URL('/filter', anikotoUrl);
    url.searchParams.set('season[0]', selection.season.toLowerCase());
    url.searchParams.set('year[0]', String(selection.year));
    url.searchParams.set('page', String(page));
    const catalog = parseAniKotoCatalogPage(await requestText(url));
    const resolved = await resolveCandidates(catalog.providerIds, (id) => loadSeries(id), {
        concurrency: 8,
    });
    const series = resolved.results.flatMap((entry) => {
        if (!entry?.anilistId || !entry.title || !entry.image) {
            return [];
        }
        return [{ ...entry, anilistId: entry.anilistId, image: entry.image }];
    });
    if (catalog.providerIds.length && !series.length) {
        throw new AggregateError(resolved.errors, 'AniKoto catalog identities could not be loaded');
    }

    await Promise.all(
        series.map((entry) => saveProviderMediaId(entry.anilistId, String(entry.id)))
    );

    const anime: AnimeCard[] = series.map((entry) => ({
        id: entry.anilistId,
        href: `/anime/${entry.anilistId}`,
        link: `/anime/${entry.anilistId}`,
        title: entry.title,
        image: entry.image,
        audioLabel: audioAvailabilityLabel(entry.audio),
        format: entry.format,
        status: entry.status,
        score: entry.score,
        genres: entry.genres,
        synopsis: entry.synopsis,
    }));

    return {
        anime,
        hasNextPage: catalog.hasNextPage,
        page,
    };
}

async function search(title: string) {
    const url = new URL('/filter', anikotoUrl);
    url.searchParams.set('keyword', title);
    return parseSearchCandidates(await requestText(url));
}

async function findSeries(anime: AniListAnime) {
    const stored = await providerMediaId(anime.id);
    const storedId = positiveId(stored);
    if (storedId) {
        try {
            const series = await loadSeries(storedId);
            if (matchesAniKotoIdentity(series, anime)) {
                await verifyProviderMediaId(anime.id);
                return series;
            }
        } catch (cause) {
            if (!(cause instanceof AniKotoRequestError) || cause.status !== 404) {
                throw cause;
            }
        }
    }

    const candidates = new Map<number, SearchCandidate>();
    for (const title of animeTitles(anime).slice(0, 6)) {
        for (const candidate of await search(title).catch(() => [])) {
            candidates.set(candidate.id, candidate);
        }
    }

    const titles = new Set(animeTitles(anime).map(normalizedProviderTitle));
    const ordered = [...candidates.values()].toSorted(
        (left, right) =>
            Number(
                titles.has(normalizedProviderTitle(right.title)) ||
                    titles.has(normalizedProviderTitle(right.alternativeTitle))
            ) -
            Number(
                titles.has(normalizedProviderTitle(left.title)) ||
                    titles.has(normalizedProviderTitle(left.alternativeTitle))
            )
    );
    for (let offset = 0; offset < ordered.length; offset += 12) {
        for (const candidate of ordered.slice(offset, offset + 12)) {
            const series = await loadSeries(candidate.id).catch(() => null);
            if (series && matchesAniKotoIdentity(series, anime)) {
                await saveProviderMediaId(anime.id, String(series.id));
                return series;
            }
        }
    }

    throw new Error(`AniKoto has no exact identity match for AniList ${anime.id}`);
}

async function episodeServers(episodeId: string) {
    return parseServerList(
        await requestJson(
            new URL(`/ajax/server/list?servers=${encodeURIComponent(episodeId)}`, anikotoUrl)
        )
    );
}

export function validEmbed(value: string | undefined, mode: AniKotoServerMode) {
    const url = validHttpsUrl(value);
    if (!url || !['megaplay.buzz', 'vidtube.site'].includes(url.hostname)) {
        return null;
    }

    const parts = url.pathname.split('/').filter(Boolean);
    const returnedMode = parts.at(-1)?.toLowerCase();
    const sourcePath = parts.slice(1, -1);
    const isStructuredPath =
        sourcePath.length === 2 && /^s-\d+$/i.test(sourcePath[0]) && /^\d+$/.test(sourcePath[1]);
    const isOpaquePath = sourcePath.length === 1 && /^[a-z0-9+%_=-]{1,1024}$/i.test(sourcePath[0]);

    return parts[0]?.toLowerCase() === 'stream' &&
        (isStructuredPath || isOpaquePath) &&
        returnedMode === mode
        ? url
        : null;
}

export type AniKotoMediaFetch = (target: URL, init: RequestInit) => Promise<Response>;

function mediaHeaders(range?: string) {
    const headers = new Headers({
        Accept: '*/*',
        Referer: aniKotoMediaReferer,
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
    });
    if (range) {
        headers.set('Range', range);
    }
    return headers;
}

export async function fetchAniKotoResource(
    initialTarget: URL,
    fetchMedia: AniKotoMediaFetch,
    options: { range?: string; signal?: AbortSignal } = {}
) {
    let target = normalizeAniKotoMediaUrl(initialTarget);
    if (!target) {
        throw new Error('AniKoto returned an unsupported media URL');
    }

    for (let redirects = 0; redirects <= 3; redirects += 1) {
        let response: Response;
        for (let attempt = 0; ; attempt += 1) {
            try {
                response = await fetchMedia(target, {
                    headers: mediaHeaders(options.range),
                    redirect: 'manual',
                    signal: options.signal
                        ? AbortSignal.any([
                              options.signal,
                              AbortSignal.timeout(aniKotoRequestTimeoutMs),
                          ])
                        : AbortSignal.timeout(aniKotoRequestTimeoutMs),
                });
                break;
            } catch (cause) {
                if (
                    !retryableMediaError(cause) ||
                    attempt >= mediaRetryCount ||
                    options.signal?.aborted
                ) {
                    throw cause;
                }
            }
        }
        if (response.status < 300 || response.status >= 400) {
            if (!response.ok && response.status !== 206) {
                throw new AniKotoRequestError(
                    `AniKoto media returned ${response.status}`,
                    response.status
                );
            }
            return { response, target };
        }

        const location = response.headers.get('location');
        if (!location || redirects === 3) {
            throw new Error('AniKoto media redirect limit exceeded');
        }
        target = normalizeAniKotoMediaUrl(new URL(location, target));
        if (!target) {
            throw new Error('AniKoto media redirected to an unsupported host');
        }
    }

    throw new Error('AniKoto media redirect limit exceeded');
}

function hlsVariant(playlist: string, base: URL) {
    const lines = playlist.split(/\r?\n/).map((line) => line.trim());
    const index = lines.findIndex((line) => line.startsWith('#EXT-X-STREAM-INF:'));
    if (index < 0) {
        return null;
    }
    const reference = lines.slice(index + 1).find((line) => line && !line.startsWith('#'));
    return reference ? normalizeAniKotoMediaUrl(new URL(reference, base)) : null;
}

function hlsSegment(playlist: string, base: URL) {
    const lines = playlist.split(/\r?\n/).map((line) => line.trim());
    const map = lines.find((line) => line.startsWith('#EXT-X-MAP:'))?.match(/URI="([^"]+)"/i)?.[1];
    const reference = map ?? lines.find((line) => line && !line.startsWith('#'));
    return reference ? normalizeAniKotoMediaUrl(new URL(reference, base)) : null;
}

function mediaSegment(value: Uint8Array) {
    const bytes = unwrapAniKotoDisguisedSegment(value);
    if (bytes.length < 4) {
        return false;
    }
    return (
        bytes[0] === 0x47 ||
        String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp' ||
        String.fromCharCode(...bytes.slice(4, 8)) === 'styp'
    );
}

async function resolvedSubtitles(captions: readonly CaptionCandidate[], signal?: AbortSignal) {
    const valid: ProviderStream['subtitles'] = [];
    for (const caption of captions) {
        const url = supportedSubtitleUrl(caption.url);
        if (!url) {
            continue;
        }

        for (const candidate of aniKotoMediaCandidates(url)) {
            try {
                const { response } = await fetchAniKotoResource(candidate, fetch, { signal });
                const text = new TextDecoder().decode(
                    await readBounded(response, aniKotoStreamLimits.subtitle, signal)
                );
                if (/^\s*WEBVTT(?:\s|$)/i.test(text)) {
                    valid.push({ kind: caption.kind, url: candidate.toString() });
                    break;
                }
            } catch {
                // Captions are optional; a broken track must not discard playable video.
            }
        }
    }
    return valid.filter(
        (caption, index, tracks) => tracks.findIndex(({ kind }) => kind === caption.kind) === index
    );
}

export async function validateAniKotoMedia(
    url: URL,
    fetchMedia: AniKotoMediaFetch = fetch,
    options: { signal?: AbortSignal } = {}
) {
    const target = normalizeAniKotoMediaUrl(url);
    if (!target) {
        throw new Error('AniKoto returned an unsupported media URL');
    }
    if (sourceIsCoolingDown(target)) {
        throw new Error('AniKoto source is cooling down after an upstream failure');
    }

    try {
        if (target.pathname.endsWith('.m3u8')) {
            const master = await fetchAniKotoResource(target, fetchMedia, options);
            const masterBody = new TextDecoder().decode(
                await readBounded(master.response, aniKotoStreamLimits.playlist, options.signal)
            );
            if (!/^\s*#EXTM3U(?:\s|$)/.test(masterBody) || !hlsVariant(masterBody, master.target)) {
                throw new Error('AniKoto returned an invalid HLS playlist');
            }

            const variantTarget = hlsVariant(masterBody, master.target);
            if (!variantTarget) {
                throw new Error('AniKoto returned no HLS variant');
            }
            const variant = await fetchAniKotoResource(variantTarget, fetchMedia, options);
            const variantBody = new TextDecoder().decode(
                await readBounded(variant.response, aniKotoStreamLimits.playlist, options.signal)
            );
            if (!/^\s*#EXTM3U(?:\s|$)/.test(variantBody)) {
                throw new Error('AniKoto returned an invalid HLS media playlist');
            }
            const segmentTarget = hlsSegment(variantBody, variant.target);
            if (!segmentTarget) {
                throw new Error('AniKoto returned no HLS media segment');
            }
            const segment = await fetchAniKotoResource(segmentTarget, fetchMedia, options);
            if (
                !mediaSegment(
                    await readBounded(segment.response, aniKotoStreamLimits.segment, options.signal)
                )
            ) {
                throw new Error('AniKoto returned an invalid HLS media segment');
            }
            return /#EXT-X-MEDIA:[^\n]*TYPE=SUBTITLES/i.test(masterBody);
        }

        const { response } = await fetchAniKotoResource(target, fetchMedia, {
            range: 'bytes=0-65535',
            signal: options.signal,
        });
        const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim();
        if (contentType && !['video/mp4', 'application/octet-stream'].includes(contentType)) {
            throw new Error('AniKoto returned a non-MP4 media response');
        }
        const bytes = await readBounded(response, 64 * 1024, options.signal);
        if (!bytes.length || !mediaSegment(bytes)) {
            throw new Error('AniKoto returned an invalid MP4 range');
        }
        return false;
    } catch (cause) {
        rememberFailedSource(target);
        throw cause;
    }
}

async function resolveMegaPlay(embed: URL, signal: AbortSignal, requiresSubtitles: boolean) {
    const sourceId = parseMegaPlaySourceId(
        await requestText(embed, { referer: `${anikotoUrl}/`, signal })
    );
    if (!sourceId) {
        throw new Error('MegaPlay embed returned no source ID');
    }

    const sourceUrl = new URL('/stream/getSources', embed.origin);
    sourceUrl.searchParams.set('id', sourceId);
    const selector = embed.searchParams.get('s');
    if (selector && /^[a-z0-9_-]{1,32}$/i.test(selector)) {
        sourceUrl.searchParams.set('s', selector);
    }
    const source = parseMegaPlaySource(await requestJson(sourceUrl, embed.toString(), signal));
    if (!source) {
        throw new Error('MegaPlay returned no supported media source');
    }

    let mediaUrl = source.mediaUrl;
    let subtitles: ProviderStream['subtitles'] = [];
    let hasSubtitles = false;
    for (const candidate of aniKotoMediaCandidates(source.mediaUrl)) {
        try {
            const embeddedSubtitles = await validateAniKotoMedia(candidate, undefined, { signal });
            subtitles = requiresSubtitles ? await resolvedSubtitles(source.captions, signal) : [];
            if (requiresSubtitles && !embeddedSubtitles && subtitles.length === 0) {
                throw new Error('AniKoto SUB source returned no subtitles');
            }
            hasSubtitles = embeddedSubtitles || subtitles.length > 0;
            mediaUrl = candidate;
            break;
        } catch {
            // Media probing is best-effort. The stream proxy performs the authoritative
            // validation when the user actually requests the source.
        }
    }
    if (requiresSubtitles && !hasSubtitles) {
        subtitles = await resolvedSubtitles(source.captions, signal);
    }
    if (requiresSubtitles && !hasSubtitles && subtitles.length === 0) {
        throw new AniKotoSubtitlesError(source.mediaUrl.toString());
    }

    return {
        url: mediaUrl.toString(),
        quality: null,
        subtitles,
    } satisfies Omit<ProviderStream, 'provider' | 'server'>;
}

async function resolveServer(
    candidate: AniKotoServerCandidate,
    signal: AbortSignal
): Promise<ProviderStream | null> {
    const response = serverResponseSchema.parse(
        await requestJson(
            new URL(`/ajax/server?get=${encodeURIComponent(candidate.linkId)}`, anikotoUrl),
            `${anikotoUrl}/`,
            signal
        )
    );
    if (response.status !== 200) {
        throw new Error('AniKoto returned an unavailable server');
    }

    const embed = validEmbed(response.result.url, candidate.embedMode);
    if (!embed) {
        throw new Error('AniKoto returned an invalid MegaPlay embed');
    }

    return {
        ...(await resolveMegaPlay(embed, signal, candidate.embedMode !== 'dub')),
        provider: providerName,
        server: candidate.label,
    };
}

async function getEpisodes(anime: AniListAnime) {
    const series = await findSeries(anime);
    const parsed = await episodesForAnime(anime, series);
    if (!parsed.length) {
        throw new Error(`AniKoto returned no playable episodes for AniList ${anime.id}`);
    }
    return parsed;
}

async function getStreams(
    anime: AniListAnime,
    episode: ProviderEpisodeReference,
    modes: AudioMode[]
): Promise<ProviderStreams> {
    const series = await findSeries(anime);
    const route = parseAniKotoEpisodeRoute(episode.id);
    const episodeSeries = route ? await loadSeries(route.seriesId) : series;
    const episodes = await loadEpisodes(episodeSeries);
    const current =
        episodes.find((candidate) => candidate.id === (route?.episodeId ?? episode.id)) ??
        episodes.find((candidate) => candidate.number === episode.number);
    if (!current) {
        throw new Error(`AniKoto has no episode ${episode.number} for AniList ${anime.id}`);
    }

    const servers = await episodeServers(current.id);
    const playableModes = playableAudioModes(current.audio, modes);
    const tasks = playableModes.flatMap((mode) =>
        servers[mode].map((candidate) => ({ mode, candidate }))
    );
    const deadline = AbortSignal.timeout(resolutionDeadlineMs);
    const { results, errors } = await resolveCandidates(
        tasks,
        ({ candidate }, signal) => resolveServer(candidate, signal),
        { concurrency: resolutionConcurrency, signal: deadline }
    );
    const result: ProviderStreams = {};
    for (const mode of playableModes) {
        result[mode] = uniqueDirectStreams(
            results.flatMap((stream, index) =>
                tasks[index]?.mode === mode && stream ? [stream] : []
            )
        );
    }

    if (result.dub?.length) {
        const subtitleUrls = new Set(result.sub?.map((stream) => stream.url));
        const rejectedSubtitleUrls = new Set(
            errors
                .filter(
                    (cause): cause is AniKotoSubtitlesError =>
                        cause instanceof AniKotoSubtitlesError
                )
                .map((cause) => cause.mediaUrl)
        );
        result.dub = result.dub.filter(
            (stream) => !subtitleUrls.has(stream.url) && !rejectedSubtitleUrls.has(stream.url)
        );
    }

    if (!Object.values(result).some((streams) => streams?.length)) {
        throw new AggregateError(
            errors,
            `AniKoto returned no playable ${playableModes.join('/')} stream for episode ${episode.id}`
        );
    }
    return result;
}

export const anikotoProvider: PlaybackProvider = {
    name: 'AniKoto',
    getEpisodes,
    getStreams,
};
