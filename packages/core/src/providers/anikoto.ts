import { and, eq, isNull, or } from 'drizzle-orm';
import { load } from 'cheerio';
import { z } from 'zod';

import { audioAvailabilityLabel, type AudioMode } from '../audio';
import type { AnimeSeasonSelection } from '../season';
import type { AnimeCard } from '../types';
import { animeTitles, plainText } from '../catalog/anilist-text';
import type { AniListAnime } from '../catalog/anilist-types';
import type { JsonValue } from '../user/utils';
import type {
    PlaybackProvider,
    ProviderEpisode,
    ProviderEpisodeReference,
    ProviderStream,
    ProviderStreams,
} from './types';
import { normalizedProviderTitle, relatedCollectionTitle } from './matching';

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
    'trycloud.pro',
    'watching.onl',
] as const;
export const aniKotoRequestTimeoutMs = 10_000;
export const aniKotoMediaReferer = 'https://megaplay.buzz/';
export const aniKotoStreamLimits = {
    playlist: 2 * 1024 * 1024,
    subtitle: 512 * 1024,
    segment: 64 * 1024 * 1024,
} as const;
// Coalesce series lookups and retain results briefly; each entry removes itself on expiry.
const seriesRequests = new Map<number, { expiresAt: number; request: Promise<AniKotoSeries> }>();
// Throttling and upstream cooldowns are shared by requests in this process.
const providerCooldownUntil = { catalog: 0, ajax: 0, site: 0 };
let providerRequestTail = Promise.resolve();
let lastProviderRequestAt = 0;
const transientProviderTransportCodes = new Set([
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ENOTFOUND',
    'EPIPE',
    'ETIMEDOUT',
]);

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
    result: z
        .object({
            url: z.string(),
        })
        .loose(),
});
const sourcePayloadSchema = z.object({
    sources: z.object({
        file: z.string().trim().min(1),
    }),
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
    episodeCount: number;
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
    format: string | null;
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

export class AniKotoRequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly retryAfterMs?: number,
        readonly localCooldown = false
    ) {
        super(message);
    }
}

export class AniKotoNoMatchError extends Error {
    constructor(readonly anilistId: number) {
        super(`AniKoto has no exact identity match for AniList ${anilistId}`);
    }
}

function providerTransportCode(cause: unknown) {
    if (!(cause instanceof Error)) {
        return null;
    }

    const error = cause as Error & { code?: string };
    if (error.code && transientProviderTransportCodes.has(error.code)) {
        return error.code;
    }

    if (!(error.cause instanceof Error)) {
        return null;
    }

    const nested = error.cause as Error & { code?: string };
    return nested.code && transientProviderTransportCodes.has(nested.code) ? nested.code : null;
}

export function isAniKotoTransientError(cause: unknown) {
    if (cause instanceof AniKotoRequestError) {
        return cause.status === 429 || cause.status >= 500;
    }

    if (providerTransportCode(cause) !== null) {
        return true;
    }

    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
        return true;
    }

    return cause instanceof AggregateError && cause.errors.some(isAniKotoTransientError);
}

function positiveId(value: JsonValue | undefined) {
    const parsed = z.union([z.number().int(), z.string().regex(/^\d+$/)]).safeParse(value);
    if (!parsed.success) {
        return null;
    }

    const number = Number(parsed.data);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function retryAfterMs(value: string | null) {
    if (!value) {
        return null;
    }

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.ceil(seconds * 1000);
    }

    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null;
}

async function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) {
        return operation;
    }

    let onAbort!: () => void;
    const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason);
        if (signal.aborted) {
            onAbort();
        } else {
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
    try {
        return await Promise.race([operation, aborted]);
    } finally {
        signal.removeEventListener('abort', onAbort);
    }
}

async function abortableDelay(delay: number, signal?: AbortSignal) {
    let timer!: ReturnType<typeof setTimeout>;
    try {
        await abortable(
            new Promise<void>((resolve) => {
                timer = setTimeout(resolve, delay);
            }),
            signal
        );
    } finally {
        clearTimeout(timer);
    }
}

async function waitForProviderRequestSlot(signal?: AbortSignal) {
    let release!: () => void;
    const turn = new Promise<void>((resolve) => {
        release = resolve;
    });
    const previous = providerRequestTail;
    providerRequestTail = previous.then(() => turn);
    await previous;

    try {
        const wait = 1_000 - (Date.now() - lastProviderRequestAt);
        if (wait > 0) {
            await abortableDelay(wait, signal);
        }
        lastProviderRequestAt = Date.now();
    } catch (cause) {
        release();
        throw cause;
    }

    return release;
}

export function isAniKotoDisguisedSegmentHost(hostname: string) {
    return (
        /^p\d+-ad-site-sign-sg\.tiktokcdn\.com$/.test(hostname) ||
        /^s\d+\.(?:akirax\.buzz|norami\.top|shiora\.site|shiora\.top)$/.test(hostname)
    );
}

export function unwrapAniKotoDisguisedSegment(value: Uint8Array) {
    const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    const pngEnd = bytes.indexOf(new Uint8Array([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]));
    if (pngEnd >= 0) {
        return value.slice(pngEnd + 8);
    }

    if (value[0] === 0xff && value[1] === 0xd8) {
        const jpegEnd = bytes.indexOf(new Uint8Array([0xff, 0xd9]), 1);
        if (jpegEnd >= 0) {
            return value.slice(jpegEnd + 2);
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
        !mediaHostSuffixes.some(
            (suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`)
        )
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

export function aniKotoSeriesIdFromEpisodeId(value: string) {
    const match = value.match(/^anikoto:(\d+):/);
    return match ? positiveId(match[1]) : null;
}

export function hasMixedAniKotoSeriesIds(episodeIds: readonly string[]) {
    return (
        new Set(episodeIds.map(aniKotoSeriesIdFromEpisodeId).filter((id) => id !== null)).size > 1
    );
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
        episodeCount: parsed.data.data.episodes?.length ?? 0,
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

export function matchesAniKotoRelatedIdentity(
    series: Pick<AniKotoSeries, 'malId'>,
    anime: Pick<AniListAnime, 'relations'>
) {
    return (anime.relations?.edges ?? []).some(
        (edge) =>
            edge?.relationType &&
            ['PARENT', 'PREQUEL', 'SEQUEL'].includes(edge.relationType) &&
            edge.node?.idMal !== null &&
            edge.node?.idMal === series.malId
    );
}

export function matchesAniKotoIdentityOrTitle(
    series: Pick<AniKotoSeries, 'anilistId' | 'malId' | 'title' | 'alternativeTitle'>,
    anime: Pick<AniListAnime, 'id' | 'idMal' | 'title' | 'synonyms'>
) {
    if (matchesAniKotoIdentity(series, anime)) {
        return true;
    }

    return (
        series.anilistId === null &&
        series.malId === null &&
        (matchesAniKotoTitle(series.title, animeTitles(anime)) ||
            matchesAniKotoTitle(series.alternativeTitle, animeTitles(anime)))
    );
}

export function matchesAniKotoTitle(title: string, titles: readonly string[]) {
    const normalizedTitle = normalizedProviderTitle(title);
    return titles.some((candidate) => normalizedTitle === normalizedProviderTitle(candidate));
}

export function matchesAniKotoFormat(providerFormat: string | null, animeFormat: string | null) {
    if (!providerFormat || !animeFormat) {
        return true;
    }

    const normalizedProviderFormat = providerFormat.toUpperCase();
    const normalizedAnimeFormat = animeFormat.toUpperCase();
    return (
        normalizedProviderFormat === normalizedAnimeFormat ||
        (normalizedProviderFormat === 'TV' && normalizedAnimeFormat === 'ONA')
    );
}

export function matchesAniKotoEpisodeCount(
    providerEpisodeCount: number | undefined,
    anime: Pick<AniListAnime, 'status' | 'format' | 'episodes'>
) {
    if (
        anime.status !== 'FINISHED' ||
        anime.format === 'TV_SHORT' ||
        providerEpisodeCount === undefined
    ) {
        return true;
    }

    return providerEpisodeCount === anime.episodes;
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
            candidates.set(id, {
                id,
                title,
                alternativeTitle,
                format: item.find('.meta .right').first().text().trim() || null,
            });
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

/** AniKoto sometimes attaches the SUB encode's VTT to the DUB entry too.
 * Leave it on SUB so the player can treat it as translated captions and
 * calibrate it against the selected DUB encode instead of mistaking it for a
 * native, already-synchronised DUB track. */
export function removeSharedDubCaptions(
    sub: readonly ProviderStream[],
    dub: readonly ProviderStream[]
) {
    const subCaptionUrls = new Set(sub.flatMap((stream) => stream.subtitles.map(({ url }) => url)));
    return dub.map((stream) => ({
        ...stream,
        subtitles: stream.subtitles.filter(({ url }) => !subCaptionUrls.has(url)),
    }));
}

/** Some AniKoto servers expose the same episode without repeating its VTT.
 * Reuse the episode's validated SUB caption file for that media candidate;
 * never invent a caption URL from another episode or provider. */
export function attachEpisodeSubtitles(streams: readonly ProviderStream[]) {
    const subtitles = streams.find((stream) => stream.subtitles.length > 0)?.subtitles ?? [];
    return streams.map((stream) =>
        stream.subtitles.length > 0 || subtitles.length === 0 ? stream : { ...stream, subtitles }
    );
}

export async function resolveCandidates<T, R>(
    candidates: readonly T[],
    resolve: (candidate: T, signal: AbortSignal) => Promise<R | null>,
    options: {
        concurrency?: number;
        signal?: AbortSignal;
    } = {}
) {
    const signal = options.signal ?? new AbortController().signal;
    const results: Array<R | null> = Array.from({ length: candidates.length }, () => null);
    const errors: unknown[] = [];
    let next = 0;
    const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, candidates.length));

    const run = async () => {
        while (!signal.aborted) {
            const index = next;
            next += 1;
            if (index >= candidates.length) {
                return;
            }

            try {
                results[index] = await abortable(resolve(candidates[index], signal), signal);
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
        await response.body?.cancel();
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
            const chunk = await abortable(reader.read(), signal);
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
    options: {
        accept?: string;
        referer?: string;
        maxBytes?: number;
        signal?: AbortSignal;
        throttle?: boolean;
    } = {}
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

    const requestFamily =
        url.origin === catalogUrl ? 'catalog' : url.pathname.startsWith('/ajax/') ? 'ajax' : 'site';
    const cooldownUntil = providerCooldownUntil[requestFamily];
    if (cooldownUntil > Date.now()) {
        const cooldown = cooldownUntil - Date.now();
        throw new AniKotoRequestError(
            `AniKoto local request cooldown is active for ${url.hostname}${url.pathname} (${cooldown}ms remaining)`,
            429,
            cooldown,
            true
        );
    }

    for (let attempt = 0; ; attempt += 1) {
        const releaseRequestSlot =
            options.throttle !== false && (url.origin === anikotoUrl || url.origin === catalogUrl)
                ? await waitForProviderRequestSlot(options.signal)
                : null;
        try {
            const response = await fetch(url, {
                headers,
                signal: options.signal
                    ? AbortSignal.any([
                          options.signal,
                          AbortSignal.timeout(aniKotoRequestTimeoutMs),
                      ])
                    : AbortSignal.timeout(aniKotoRequestTimeoutMs),
            });
            if (!response.ok) {
                const retryAfter = retryAfterMs(response.headers.get('retry-after'));
                if (response.status === 429) {
                    const cooldown =
                        retryAfter !== null && retryAfter <= 5 * 60_000 ? retryAfter : 30_000;
                    providerCooldownUntil[requestFamily] = Date.now() + cooldown;
                    await response.body?.cancel().catch(() => undefined);
                    throw new AniKotoRequestError(
                        `AniKoto returned 429 for ${url.hostname}${url.pathname} (cooldown ${cooldown}ms)`,
                        response.status,
                        cooldown
                    );
                }
                if (
                    [500, 502, 503, 504].includes(response.status) &&
                    attempt < 2 &&
                    (retryAfter === null || retryAfter <= 60_000)
                ) {
                    const delay = retryAfter ?? Math.min(60_000, 500 * 2 ** attempt);
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
                await readBounded(response, options.maxBytes ?? 2 * 1024 * 1024, options.signal)
            );
        } catch (cause) {
            if (cause instanceof DOMException && cause.name === 'TimeoutError') {
                const cooldown = 30_000;
                providerCooldownUntil[requestFamily] = Date.now() + cooldown;
                throw new AniKotoRequestError(
                    `AniKoto request timed out for ${url.hostname}${url.pathname} (cooldown ${cooldown}ms)`,
                    504,
                    cooldown
                );
            }
            const transportCode = providerTransportCode(cause);
            if (transportCode) {
                const cooldown = 30_000;
                providerCooldownUntil[requestFamily] = Date.now() + cooldown;
                throw new AniKotoRequestError(
                    `AniKoto request failed for ${url.hostname}${url.pathname} (${transportCode}; cooldown ${cooldown}ms)`,
                    503,
                    cooldown
                );
            }
            throw cause;
        } finally {
            releaseRequestSlot?.();
        }
    }
}

async function requestJson(
    url: URL,
    referer = `${anikotoUrl}/`,
    signal?: AbortSignal,
    throttle = true
) {
    const text = await requestText(url, {
        accept: 'application/json',
        referer,
        signal,
        throttle,
    });
    try {
        return z.json().parse(JSON.parse(text));
    } catch (cause) {
        throw new Error('AniKoto returned invalid JSON', { cause });
    }
}

async function providerMediaId(anilistId: number) {
    const [{ db }, schema] = await Promise.all([
        import('@arc/shared/db'),
        import('@arc/shared/db/schema'),
    ]);
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
        return { id: override.id, inventoryStatus: 'override' };
    }

    const [[stored], episodes] = await Promise.all([
        db
            .select({
                id: schema.animeProviderMapping.providerMediaId,
                inventoryStatus: schema.animeProviderMapping.inventoryStatus,
            })
            .from(schema.animeProviderMapping)
            .where(
                and(
                    eq(schema.animeProviderMapping.anilistId, anilistId),
                    eq(schema.animeProviderMapping.provider, providerName)
                )
            )
            .limit(1),
        db
            .select({ episodeId: schema.animeEpisode.episodeId })
            .from(schema.animeEpisode)
            .where(eq(schema.animeEpisode.anilistId, anilistId)),
    ]);
    if (stored && hasMixedAniKotoSeriesIds(episodes.map(({ episodeId }) => episodeId))) {
        return null;
    }

    return stored ?? null;
}

async function saveProviderMediaId(anilistId: number, id: string) {
    const [{ db }, schema] = await Promise.all([
        import('@arc/shared/db'),
        import('@arc/shared/db/schema'),
    ]);
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
            inventoryStatus: 'candidate',
        })
        .onConflictDoUpdate({
            target: [schema.animeProviderMapping.anilistId, schema.animeProviderMapping.provider],
            set: {
                providerMediaId: id,
                discoveredAt: now,
            },
        });
}

export async function recordAniKotoInventoryVerification(
    anime: AniListAnime,
    providerEpisodes: readonly ProviderEpisode[],
    selectedEpisodes: readonly ProviderEpisode[],
    expectedEpisodes: number | null,
    status: 'verified' | 'unresolved',
    error: string | null = null
) {
    const seriesIds = new Set(
        providerEpisodes
            .map(({ id }) => aniKotoSeriesIdFromEpisodeId(id))
            .filter((id): id is number => id !== null)
    );
    if (seriesIds.size !== 1) {
        return;
    }

    const now = new Date();
    const [{ db }, schema] = await Promise.all([
        import('@arc/shared/db'),
        import('@arc/shared/db/schema'),
    ]);
    await db
        .update(schema.animeProviderMapping)
        .set({
            inventoryStatus: status,
            expectedEpisodeCount: expectedEpisodes,
            providerEpisodeCount: providerEpisodes.length,
            providerEpisodeIds: providerEpisodes.map(({ id }) => id),
            verificationEvidence: {
                anilistTitle: anime.title,
                anilistFormat: anime.format,
                anilistStatus: anime.status,
                expectedEpisodeCount: expectedEpisodes,
                providerEpisodeNumbers: providerEpisodes.map(({ number }) => number),
                selectedEpisodeNumbers: selectedEpisodes.map(({ number }) => number),
            },
            nextRetryAt:
                status === 'unresolved' ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000) : null,
            lastError: error,
            verifiedAt: status === 'verified' ? now : undefined,
        })
        .where(
            and(
                eq(schema.animeProviderMapping.anilistId, anime.id),
                eq(schema.animeProviderMapping.provider, providerName),
                eq(
                    schema.animeProviderMapping.providerMediaId,
                    String(seriesIds.values().next().value!)
                )
            )
        );
}

async function loadSeries(id: number) {
    const now = Date.now();
    const storedRequest = seriesRequests.get(id);
    if (storedRequest) {
        if (storedRequest.expiresAt > now) {
            return storedRequest.request;
        }
        seriesRequests.delete(id);
    }

    const request = requestJson(new URL(`/series/${id}`, catalogUrl)).then((value) => {
        const series = parseSeries(value);
        if (!series || series.id !== id) {
            throw new Error('AniKoto returned an invalid series response');
        }
        return series;
    });
    const entry = { expiresAt: now + 5 * 60_000, request };
    seriesRequests.set(id, entry);
    let expiry = setTimeout(
        () => {
            if (seriesRequests.get(id) === entry) {
                seriesRequests.delete(id);
            }
        },
        Math.max(0, entry.expiresAt - Date.now())
    );
    expiry.unref();
    void request.catch(() => {
        clearTimeout(expiry);
        if (seriesRequests.get(id) === entry) {
            entry.expiresAt = Date.now() + 30_000;
            expiry = setTimeout(() => {
                if (seriesRequests.get(id) === entry) {
                    seriesRequests.delete(id);
                }
            }, 30_000);
            expiry.unref();
        }
    });
    return request;
}

async function episodesForAnime(series: Pick<AniKotoSeries, 'id'>) {
    const primary = parseEpisodeList(
        await requestJson(new URL(`/ajax/episode/list/${series.id}`, anikotoUrl))
    );
    // Episode inventory is scoped to the requested provider series. Do not walk
    // AniList PREQUEL/SEQUEL relations here: that turns one page visit into a
    // franchise-wide provider lookup and makes a cold page appear stuck.
    return primary.map((episode) => ({
        ...episode,
        id: `anikoto:${series.id}:${encodeURIComponent(episode.id)}`,
    }));
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
    const titles = animeTitles(anime).map(normalizedProviderTitle);
    const stored = await providerMediaId(anime.id);
    const storedId = positiveId(stored?.id);
    if (storedId && stored?.inventoryStatus !== 'unresolved') {
        try {
            const series = await loadSeries(storedId);
            if (
                (matchesAniKotoIdentityOrTitle(series, anime) ||
                    matchesAniKotoRelatedIdentity(series, anime)) &&
                matchesAniKotoFormat(series.format, anime.format) &&
                matchesAniKotoEpisodeCount(series.episodeCount, anime)
            ) {
                return series;
            }
        } catch (cause) {
            if (cause instanceof AniKotoRequestError && isAniKotoTransientError(cause)) {
                return { id: storedId };
            }
            if (!(cause instanceof AniKotoRequestError) || cause.status !== 404) {
                throw cause;
            }
        }
    }

    const candidates = new Map<number, SearchCandidate>();
    for (const title of animeTitles(anime).slice(0, 6)) {
        for (const candidate of await search(title)) {
            candidates.set(candidate.id, candidate);
        }
    }

    const ordered = [...candidates.values()].toSorted(
        (left, right) =>
            Number(
                titles.some(
                    (title) =>
                        relatedCollectionTitle(title, right.title) ||
                        relatedCollectionTitle(title, right.alternativeTitle)
                )
            ) -
            Number(
                titles.some(
                    (title) =>
                        relatedCollectionTitle(title, left.title) ||
                        relatedCollectionTitle(title, left.alternativeTitle)
                )
            )
    );
    for (const candidate of ordered.slice(0, 24)) {
        if (!matchesAniKotoFormat(candidate.format, anime.format)) {
            continue;
        }

        let series: AniKotoSeries | { id: number } | null;
        try {
            series = await loadSeries(candidate.id);
        } catch (cause) {
            if (cause instanceof AniKotoRequestError && cause.status === 404) {
                series = null;
            } else if (
                cause instanceof AniKotoRequestError &&
                cause.status === 429 &&
                titles.some(
                    (title) =>
                        relatedCollectionTitle(title, candidate.title) ||
                        relatedCollectionTitle(title, candidate.alternativeTitle)
                )
            ) {
                series = { id: candidate.id };
            } else {
                throw cause;
            }
        }
        if (
            series &&
            matchesAniKotoFormat(
                'format' in series ? series.format : candidate.format,
                anime.format
            ) &&
            ('anilistId' in series
                ? matchesAniKotoIdentityOrTitle(series, anime) ||
                  matchesAniKotoRelatedIdentity(series, anime)
                : matchesAniKotoTitle(candidate.title, titles)) &&
            ('episodeCount' in series
                ? matchesAniKotoEpisodeCount(series.episodeCount, anime)
                : true)
        ) {
            await saveProviderMediaId(anime.id, String(series.id));
            return series;
        }
    }
    throw new AniKotoNoMatchError(anime.id);
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

export async function resolveMegaPlay(embed: URL, signal: AbortSignal) {
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

    // Source discovery must stay cheap: the stream proxy validates the media body when
    // selected, while returning every server here lets the player fail over without
    // spending several requests probing candidates that may never be used.
    const subtitles: ProviderStream['subtitles'] = source.captions.map(({ kind, url }) => ({
        kind,
        url,
    }));

    return {
        url: source.mediaUrl.toString(),
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
            signal,
            false
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
        ...(await resolveMegaPlay(embed, signal)),
        provider: providerName,
        server: candidate.label,
    };
}

async function getEpisodes(anime: AniListAnime) {
    const series = await findSeries(anime);
    const parsed = await episodesForAnime(series);
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
    const routeMatch = episode.id.match(/^anikoto:(\d+):(.+)$/);
    let route: { seriesId: number; episodeId: string } | null = null;
    if (routeMatch) {
        const seriesId = positiveId(routeMatch[1]);
        if (seriesId) {
            try {
                const episodeId = decodeURIComponent(routeMatch[2]);
                if (validOpaqueId(episodeId)) {
                    route = { seriesId, episodeId };
                }
            } catch {
                // Keep legacy provider IDs usable when a persisted route is malformed.
            }
        }
    }
    const episodeSeries = route ? null : await findSeries(anime);
    const episodes = parseEpisodeList(
        await requestJson(
            new URL(`/ajax/episode/list/${route?.seriesId ?? episodeSeries?.id}`, anikotoUrl)
        )
    );
    const current =
        episodes.find((candidate) => candidate.id === (route?.episodeId ?? episode.id)) ??
        episodes.find((candidate) => candidate.number === episode.number);
    if (!current) {
        throw new Error(`AniKoto has no episode ${episode.number} for AniList ${anime.id}`);
    }

    const servers = parseServerList(
        await requestJson(
            new URL(`/ajax/server/list?servers=${encodeURIComponent(current.id)}`, anikotoUrl)
        )
    );
    const playableModes = playableAudioModes(current.audio, modes);
    const tasks = playableModes.flatMap((mode) =>
        servers[mode].map((candidate) => ({ mode, candidate }))
    );
    const deadline = AbortSignal.timeout(30_000);
    const { results, errors } = await resolveCandidates(
        tasks,
        ({ candidate }, signal) => resolveServer(candidate, signal),
        {
            concurrency: 4,
            signal: deadline,
        }
    );
    const result: ProviderStreams = {};
    for (const mode of playableModes) {
        result[mode] = uniqueDirectStreams(
            results.flatMap((stream, index) =>
                tasks[index]?.mode === mode && stream ? [stream] : []
            )
        );
    }

    // A SUB source without an English track is not a valid subtitled playback
    // candidate. Keep trying other AniKoto servers instead of exposing silent video.
    if (result.sub?.length) {
        result.sub = attachEpisodeSubtitles(result.sub);
    }

    if (result.dub?.length) {
        const subtitleUrls = new Set(result.sub?.map((stream) => stream.url));
        result.dub = removeSharedDubCaptions(
            result.sub ?? [],
            result.dub.filter((stream) => !subtitleUrls.has(stream.url))
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
