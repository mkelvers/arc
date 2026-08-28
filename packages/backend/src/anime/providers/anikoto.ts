import { and, eq, isNull, or } from 'drizzle-orm';
import { load } from 'cheerio';
import { z } from 'zod';

import type { AudioMode } from '@arc/shared/audio';
import { animeTitles } from '../anilist/text';
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
    'shiora.top',
    'tiktokcdn.com',
    'watching.onl',
] as const;
const requestTimeoutMs = 8_000;
const failedSourceCooldownMs = 30_000;
const maxTextBytes = 2 * 1024 * 1024;
const failedSourceHosts = new Map<string, number>();

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
}

interface SearchCandidate {
    id: number;
    title: string;
    alternativeTitle: string;
}

export interface AniKotoServerCandidate {
    mode: Exclude<AudioMode, 'raw'>;
    embedMode: AniKotoServerMode;
    linkId: string;
    label: string;
}

interface CaptionCandidate {
    url: string;
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

function sourceIsCoolingDown(url: URL) {
    const retryAt = failedSourceHosts.get(url.hostname);
    if (retryAt === undefined) {
        return false;
    }
    if (retryAt <= Date.now()) {
        failedSourceHosts.delete(url.hostname);
        return false;
    }
    return true;
}

function rememberFailedSource(url: URL) {
    failedSourceHosts.set(url.hostname, Date.now() + failedSourceCooldownMs);
}

function isTransientSourceFailure(cause: unknown) {
    return (
        cause instanceof TypeError ||
        (cause instanceof AniKotoRequestError && (cause.status === 429 || cause.status >= 500))
    );
}

export function supportedAniKotoHost(hostname: string) {
    return supportedHost(hostname);
}

export function isAniKotoDisguisedSegmentHost(hostname: string) {
    return (
        /^p\d+-ad-site-sign-sg\.tiktokcdn\.com$/.test(hostname) ||
        /^s\d+\.(?:akirax\.buzz|shiora\.top)$/.test(hostname)
    );
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
    if (!url || !supportedHost(url.hostname)) {
        return null;
    }

    return /\.(?:m3u8|mp4)$/i.test(url.pathname) ? url : null;
}

export function supportedSubtitleUrl(value: string) {
    const url = validHttpsUrl(value);
    if (!url || !supportedHost(url.hostname) || !/\.vtt$/i.test(url.pathname)) {
        return null;
    }

    return url;
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

    return {
        id,
        anilistId: positiveId(parsed.data.data.anime.ani_id),
        malId: positiveId(parsed.data.data.anime.mal_id),
        title: parsed.data.data.anime.title.trim(),
        alternativeTitle: parsed.data.data.anime.alternative?.trim() ?? '',
    };
}

export function matchesAniKotoIdentity(
    series: Pick<AniKotoSeries, 'anilistId' | 'malId'>,
    anime: Pick<AniListAnime, 'id' | 'idMal'>
) {
    if (series.anilistId !== null) {
        return series.anilistId === anime.id;
    }

    return Boolean(anime.idMal && series.malId !== null && series.malId === anime.idMal);
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

        const seen = new Set<string>();
        $(element)
            .find('li[data-link-id]')
            .each((_, server) => {
                const item = $(server);
                const linkId = item.attr('data-link-id')?.trim() ?? '';
                if (validOpaqueId(linkId) && !seen.has(linkId)) {
                    seen.add(linkId);
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
            captions.push({ url: url.toString(), preferred: track.default === true });
        }
    }

    captions.sort((left, right) => Number(right.preferred) - Number(left.preferred));
    return { mediaUrl, captions };
}

export function uniqueDirectStreams(streams: readonly ProviderStream[]) {
    const seen = new Set<string>();
    return streams.filter((stream) => {
        if (stream.kind === 'iframe') {
            return false;
        }

        const key = `${stream.url}\n${stream.subtitleUrl ?? ''}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

export async function firstPlayable<T>(
    candidates: readonly T[],
    resolve: (candidate: T) => Promise<ProviderStream | null>
) {
    const errors: unknown[] = [];
    for (const candidate of candidates) {
        try {
            const stream = await resolve(candidate);
            if (stream) {
                return stream;
            }
        } catch (cause) {
            errors.push(cause);
        }
    }

    throw new AggregateError(errors, 'AniKoto returned no playable server');
}

async function readBounded(response: Response, limit: number) {
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > limit) {
        throw new Error('AniKoto response exceeded its size limit');
    }

    if (!response.body) {
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > limit) {
            throw new Error('AniKoto response exceeded its size limit');
        }
        return text;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const chunk = await reader.read();
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
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
}

async function requestText(
    url: URL,
    options: { accept?: string; referer?: string; maxBytes?: number } = {}
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

    const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
        throw new AniKotoRequestError(
            `AniKoto returned ${response.status} for ${url.hostname}${url.pathname}`,
            response.status
        );
    }

    return readBounded(response, options.maxBytes ?? maxTextBytes);
}

async function requestJson(url: URL, referer = `${anikotoUrl}/`) {
    const text = await requestText(url, { accept: 'application/json', referer });
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

    const results = await Promise.allSettled(animeTitles(anime).slice(0, 6).map(search));
    const candidates = new Map<number, SearchCandidate>();
    for (const result of results) {
        if (result.status === 'fulfilled') {
            for (const candidate of result.value) {
                candidates.set(candidate.id, candidate);
            }
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
        const batch = await Promise.allSettled(
            ordered.slice(offset, offset + 12).map((candidate) => loadSeries(candidate.id))
        );
        const match = batch.find(
            (result): result is PromiseFulfilledResult<AniKotoSeries> =>
                result.status === 'fulfilled' && matchesAniKotoIdentity(result.value, anime)
        );
        if (match) {
            await saveProviderMediaId(anime.id, String(match.value.id));
            return match.value;
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

async function resolvedSubtitle(captions: readonly CaptionCandidate[], referer: string) {
    for (const caption of captions) {
        const url = supportedSubtitleUrl(caption.url);
        if (!url) {
            continue;
        }

        try {
            const text = await requestText(url, {
                accept: 'text/vtt',
                referer,
                maxBytes: 512 * 1024,
            });
            if (/^\s*WEBVTT(?:\s|$)/i.test(text)) {
                return url.toString();
            }
        } catch {
            // Captions are optional; a broken track must not discard playable video.
        }
    }
    return null;
}

async function verifyMedia(url: URL, referer: string) {
    if (sourceIsCoolingDown(url)) {
        throw new Error('AniKoto source is cooling down after an upstream failure');
    }

    try {
        if (url.pathname.endsWith('.m3u8')) {
            const playlist = await requestText(url, {
                accept: 'application/vnd.apple.mpegurl',
                referer,
            });
            if (!/^\s*#EXTM3U(?:\s|$)/.test(playlist)) {
                throw new Error('AniKoto returned an invalid HLS playlist');
            }
            return;
        }

        const response = await fetch(url, {
            headers: {
                Accept: 'video/mp4,application/octet-stream;q=0.9,*/*;q=0.1',
                Referer: referer,
                Range: 'bytes=0-65535',
                'User-Agent': 'Mozilla/5.0 Chrome/140 Safari/537.36',
            },
            signal: AbortSignal.timeout(requestTimeoutMs),
        });
        if (!response.ok && response.status !== 206) {
            throw new AniKotoRequestError(
                `AniKoto media returned ${response.status}`,
                response.status
            );
        }
        const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim();
        if (contentType && !['video/mp4', 'application/octet-stream'].includes(contentType)) {
            throw new Error('AniKoto returned a non-MP4 media response');
        }
        await readBounded(response, 64 * 1024);
    } catch (cause) {
        if (isTransientSourceFailure(cause)) {
            rememberFailedSource(url);
        }
        throw cause;
    }
}

async function resolveMegaPlay(embed: URL) {
    const sourceId = parseMegaPlaySourceId(await requestText(embed, { referer: `${anikotoUrl}/` }));
    if (!sourceId) {
        throw new Error('MegaPlay embed returned no source ID');
    }

    const sourceUrl = new URL('/stream/getSources', embed.origin);
    sourceUrl.searchParams.set('id', sourceId);
    const selector = embed.searchParams.get('s');
    if (selector && /^[a-z0-9_-]{1,32}$/i.test(selector)) {
        sourceUrl.searchParams.set('s', selector);
    }
    const source = parseMegaPlaySource(await requestJson(sourceUrl, embed.toString()));
    if (!source) {
        throw new Error('MegaPlay returned no supported media source');
    }

    await verifyMedia(source.mediaUrl, `${embed.origin}/`);
    return {
        url: source.mediaUrl.toString(),
        kind: 'direct',
        quality: null,
        subtitleUrl: await resolvedSubtitle(source.captions, `${embed.origin}/`),
        provider: 'AniKoto',
    } satisfies ProviderStream;
}

async function resolveServer(
    candidate: AniKotoServerCandidate,
    resolutions: Map<string, Promise<ProviderStream>>
): Promise<ProviderStream | null> {
    const response = serverResponseSchema.parse(
        await requestJson(
            new URL(`/ajax/server?get=${encodeURIComponent(candidate.linkId)}`, anikotoUrl)
        )
    );
    if (response.status !== 200) {
        throw new Error('AniKoto returned an unavailable server');
    }

    const embed = validEmbed(response.result.url, candidate.embedMode);
    if (!embed) {
        throw new Error('AniKoto returned an invalid MegaPlay embed');
    }

    const key = embed.toString();
    const existing = resolutions.get(key);
    if (existing) {
        return existing.catch(() => null);
    }

    const resolution = resolveMegaPlay(embed);
    resolutions.set(key, resolution);
    return resolution;
}

async function getEpisodes(anime: AniListAnime) {
    const series = await findSeries(anime);
    const parsed = parseEpisodeList(
        await requestJson(new URL(`/ajax/episode/list/${series.id}`, anikotoUrl))
    );
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
    const episodes = parseEpisodeList(
        await requestJson(new URL(`/ajax/episode/list/${series.id}`, anikotoUrl))
    );
    const current =
        episodes.find((candidate) => candidate.id === episode.id) ??
        episodes.find((candidate) => candidate.number === episode.number);
    if (!current) {
        throw new Error(`AniKoto has no episode ${episode.number} for AniList ${anime.id}`);
    }

    const servers = await episodeServers(current.id);
    const result: ProviderStreams = {};
    const errors: unknown[] = [];
    const resolutions = new Map<string, Promise<ProviderStream>>();
    const playableModes = playableAudioModes(current.audio, modes);
    for (const mode of playableModes) {
        const candidates = servers[mode];
        if (!candidates.length) {
            errors.push(new Error(`AniKoto returned no ${mode} servers`));
        } else {
            try {
                result[mode] = [
                    await firstPlayable(candidates, (candidate) =>
                        resolveServer(candidate, resolutions)
                    ),
                ];
            } catch (cause) {
                errors.push(cause);
            }
        }
    }

    for (const mode of ['sub', 'dub'] as const) {
        if (result[mode]) {
            result[mode] = uniqueDirectStreams(result[mode]);
        }
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
