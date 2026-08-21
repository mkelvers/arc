import { load } from 'cheerio';
import { z } from 'zod';

import type { AudioMode } from '$lib/audio';
import { positiveInteger } from '$lib/utils';
import { animeTitles } from '../anilist/text';
import { fullestCaption } from './captions';
import { settledStreams } from './fallback';
import { providerMediaId, saveProviderMediaId, verifyProviderMediaId } from './mapping';
import {
    isSpecialEpisodeReference,
    matchProviderStreamEpisode,
    normalizedProviderTitle,
    specialCollectionMatches,
    specialReleaseQueries,
    standaloneSpecialMatches,
} from './match';
import type { AniListAnime } from '../anilist/types';
import type { PlaybackProvider, ProviderEpisode, ProviderStream } from './types';
import type { JsonValue } from '$lib/utils';

const baseUrl = 'https://anikototv.to';
const catalogUrl = 'https://anikotoapi.site';
const megaplayUrl = 'https://megaplay.buzz';
const providerName = 'anikoto';
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const seriesSchema = z.object({
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
                    embed_url: z
                        .object({ sub: z.string().nullish(), dub: z.string().nullish() })
                        .optional(),
                })
            ),
        })
        .optional(),
});
const mediaUrlSchema = z.string();
const trackSchema = z.object({
    kind: z.string(),
    label: z.string(),
    file: z.string(),
    default: z.boolean().optional(),
});
const sourcePayloadSchema = z.object({
    sources: z.object({ file: z.string() }),
    tracks: z.array(trackSchema).optional(),
});

interface AniKotoEpisode {
    embedId: string;
    number: number;
    title: string;
    embeds: Partial<Record<'sub' | 'dub', string>>;
}

interface AniKotoSeries {
    id: number;
    anilistId: number | null;
    malId: number | null;
    title: string;
    alternativeTitle: string;
    episodes: AniKotoEpisode[];
}

interface SearchCandidate {
    id: number;
    title: string;
    alternativeTitle: string;
}

class AniKotoRequestError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message);
    }
}

async function requestText(
    url: URL,
    {
        accept = 'text/html',
        referer = `${baseUrl}/`,
        xhr = false,
    }: {
        accept?: string;
        referer?: string;
        xhr?: boolean;
    } = {}
) {
    const requestHeaders = new Headers({
        Accept: accept,
        Referer: referer,
        'User-Agent': userAgent,
    });
    if (xhr) {
        requestHeaders.set('X-Requested-With', 'XMLHttpRequest');
    }
    const response = await fetch(url, {
        headers: requestHeaders,
        signal: AbortSignal.timeout(8_000),
    });
    const text = await response.text();

    if (!response.ok) {
        throw new AniKotoRequestError(
            `AniKoto returned ${response.status} for ${url.hostname}${url.pathname}`,
            response.status
        );
    }

    return text;
}

async function requestJson(url: URL, referer = `${baseUrl}/`) {
    const text = await requestText(url, {
        accept: 'application/json',
        referer,
        xhr: true,
    });

    try {
        return JSON.parse(text) as JsonValue;
    } catch (cause) {
        throw new Error('AniKoto returned an invalid JSON response', {
            cause,
        });
    }
}

function searchCandidates(html: string) {
    const $ = load(html);
    const candidates = new Map<number, SearchCandidate>();

    $('.main .item').each((_, element) => {
        const item = $(element);
        const id = positiveInteger(item.find('.poster[data-tip]').first().attr('data-tip'));
        const titleElement = item.find('.name').first();
        const title = titleElement.text().trim();
        const alternativeTitle = titleElement.attr('data-jp')?.trim() ?? '';

        if (id && title) {
            candidates.set(id, { id, title, alternativeTitle });
        }
    });

    return [...candidates.values()];
}

function episodeTitle(value: JsonValue) {
    const parsed = z.string().safeParse(value);
    if (!parsed.success || !parsed.data.trim()) {
        return '';
    }

    return load(`<span>${parsed.data}</span>`)('span').text().trim();
}

function parseSeries(value: JsonValue): AniKotoSeries | null {
    const parsed = seriesSchema.safeParse(value);
    if (!parsed.success || !parsed.data.ok || !parsed.data.data) {
        return null;
    }
    const { anime, episodes: rawEpisodes } = parsed.data.data;
    const id = positiveInteger(anime.id);
    if (!id) {
        return null;
    }

    const episodes = rawEpisodes.flatMap((episode) => {
        const embedUrls = episode.embed_url;
        const number = Number(episode.number);
        if (!Number.isFinite(number) || number <= 0) {
            return [];
        }

        const embeds: AniKotoEpisode['embeds'] = {};
        if (embedUrls?.sub) {
            embeds.sub = embedUrls.sub;
        }
        if (embedUrls?.dub) {
            embeds.dub = embedUrls.dub;
        }

        return [
            {
                embedId: episode.episode_embed_id,
                number,
                title: episodeTitle(episode.title),
                embeds,
            },
        ];
    });

    return {
        id,
        anilistId: positiveInteger(anime.ani_id) ?? null,
        malId: positiveInteger(anime.mal_id) ?? null,
        title: anime.title.trim(),
        alternativeTitle: anime.alternative?.trim() ?? '',
        episodes,
    };
}

async function loadSeries(id: number) {
    const value = await requestJson(new URL(`/series/${id}`, catalogUrl), `${baseUrl}/`);
    const series = parseSeries(value);
    if (!series || series.id !== id) {
        throw new Error('AniKoto returned an invalid series response');
    }

    return series;
}

function exactIdentity(series: AniKotoSeries, anime: AniListAnime) {
    if (series.anilistId !== null) {
        return series.anilistId === anime.id;
    }

    return Boolean(anime.idMal && series.malId !== null && series.malId === anime.idMal);
}

async function search(title: string) {
    const url = new URL('/filter', baseUrl);
    url.searchParams.set('keyword', title);
    return searchCandidates(await requestText(url));
}

async function matchingSeries(candidates: SearchCandidate[], anime: AniListAnime) {
    const titles = new Set(animeTitles(anime).map(normalizedProviderTitle));
    const exact = candidates.filter(
        (candidate) =>
            titles.has(normalizedProviderTitle(candidate.title)) ||
            titles.has(normalizedProviderTitle(candidate.alternativeTitle))
    );
    const ordered = [...exact, ...candidates.filter((candidate) => !exact.includes(candidate))];

    for (let offset = 0; offset < ordered.length; offset += 12) {
        const batch = await Promise.allSettled(
            ordered.slice(offset, offset + 12).map((candidate) => loadSeries(candidate.id))
        );
        const match = batch.find(
            (result): result is PromiseFulfilledResult<AniKotoSeries> =>
                result.status === 'fulfilled' && exactIdentity(result.value, anime)
        );
        if (match) {
            return match.value;
        }
    }

    return null;
}

async function findSeries(anime: AniListAnime, refresh = false) {
    if (!refresh) {
        const stored = positiveInteger(await providerMediaId(anime.id, providerName));
        if (stored) {
            try {
                const series = await loadSeries(stored);
                if (exactIdentity(series, anime)) {
                    await verifyProviderMediaId(anime.id, providerName);
                    return series;
                }
            } catch (cause) {
                if (!(cause instanceof AniKotoRequestError) || cause.status !== 404) {
                    throw cause;
                }
            }
        }
    }

    const results = await Promise.allSettled(animeTitles(anime).slice(0, 6).map(search));
    const candidates = new Map<number, SearchCandidate>();
    for (const result of results) {
        if (result.status !== 'fulfilled') {
            continue;
        }
        for (const candidate of result.value) {
            candidates.set(candidate.id, candidate);
        }
    }

    const series = await matchingSeries([...candidates.values()], anime);
    if (!series) {
        throw new Error(`AniKoto has no exact identity match for AniList ${anime.id}`);
    }

    await saveProviderMediaId(anime.id, providerName, String(series.id));
    return series;
}

function validEmbed(value: string | undefined, mode: 'sub' | 'dub') {
    if (!value) {
        return null;
    }

    try {
        const url = new URL(value);
        const match = url.pathname.match(/^\/stream\/s-\d+\/(\d+)\/(sub|dub)$/);
        return url.protocol === 'https:' && url.hostname === 'megaplay.buzz' && match?.[2] === mode
            ? url
            : null;
    } catch {
        return null;
    }
}

function episodeModes(episode: AniKotoEpisode) {
    return (['sub', 'dub'] as const).filter((mode) =>
        Boolean(validEmbed(episode.embeds[mode], mode))
    );
}

async function providerSeries(anime: AniListAnime) {
    const series = await findSeries(anime);
    const episodes = series.episodes
        .filter((episode) => episodeModes(episode).length)
        .sort((left, right) => left.number - right.number);
    if (!episodes.length) {
        throw new Error(`AniKoto returned no playable episodes for AniList ${anime.id}`);
    }

    return { series, episodes };
}

async function specialReleaseEpisode(
    anime: AniListAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1]
) {
    const results = await Promise.allSettled(specialReleaseQueries(anime, episode).map(search));
    const candidates = new Map<number, SearchCandidate>();

    for (const result of results) {
        if (result.status !== 'fulfilled') {
            continue;
        }
        for (const candidate of result.value) {
            if (
                standaloneSpecialMatches(anime, episode, [
                    candidate.title,
                    candidate.alternativeTitle,
                ]) ||
                specialCollectionMatches(anime, episode, [
                    candidate.title,
                    candidate.alternativeTitle,
                ])
            ) {
                candidates.set(candidate.id, candidate);
            }
        }
    }

    const values = [...candidates.values()];
    for (let offset = 0; offset < values.length; offset += 12) {
        const batch = await Promise.allSettled(
            values.slice(offset, offset + 12).map((candidate) => loadSeries(candidate.id))
        );

        for (const result of batch) {
            if (result.status !== 'fulfilled') {
                continue;
            }

            const playable = result.value.episodes.filter(
                (candidate) => episodeModes(candidate).length
            );
            const titles = [result.value.title, result.value.alternativeTitle];
            if (standaloneSpecialMatches(anime, episode, titles) && playable.length === 1) {
                return playable[0];
            }
            if (
                specialCollectionMatches(anime, episode, titles, playable.length) &&
                episode.specialIndex
            ) {
                return playable[episode.specialIndex - 1];
            }
        }
    }

    throw new Error(`AniKoto has no matching special release for ${episode.title || episode.id}`);
}

async function getEpisodes(anime: AniListAnime) {
    const { episodes } = await providerSeries(anime);
    const unique = new Map<number, ProviderEpisode>();

    for (const episode of episodes) {
        unique.set(episode.number, {
            id: String(episode.number),
            number: episode.number,
            title: episode.title,
            audio: episodeModes(episode),
        });
    }

    return [...unique.values()];
}

function sourceId(html: string) {
    const $ = load(html);
    const dataId = $('[data-id]')
        .map((_, element) => $(element).attr('data-id'))
        .get()
        .find((value) => /^\d+$/.test(value ?? ''));

    return dataId ?? html.match(/<title>\s*File\s+(\d+)\s+-/i)?.[1] ?? null;
}

function supportedMediaUrl(value: JsonValue) {
    const parsed = mediaUrlSchema.safeParse(value);
    if (!parsed.success) {
        return null;
    }

    try {
        const url = new URL(parsed.data);
        // MegaPlay serves each series from a rotated `megap.<host>` CDN
        // subdomain, so match the shared prefix rather than fixed hosts.
        const supported =
            url.hostname.startsWith('megap.') ||
            url.hostname === 'watching.onl' ||
            url.hostname.endsWith('.watching.onl') ||
            url.hostname === 'lostproject.club' ||
            url.hostname.endsWith('.lostproject.club');
        return url.protocol === 'https:' && supported ? url : null;
    } catch {
        return null;
    }
}

function englishCaptionTracks(payload: z.infer<typeof sourcePayloadSchema>) {
    if (!payload.tracks) {
        return [];
    }

    const candidates: { url: string; preferred: boolean }[] = [];
    for (const track of payload.tracks) {
        const kind = track.kind.toLowerCase();
        const label = track.label.toLowerCase();
        if (kind !== 'captions' || !/\benglish\b/.test(label)) {
            continue;
        }

        const url = supportedMediaUrl(track.file);
        if (url) {
            candidates.push({
                url: url.toString(),
                preferred: track.default === true,
            });
        }
    }

    return candidates;
}

/** Pick the English track with the most cues. A plain "English" label can be
 * signs-only, while an AI-labelled track can carry the only full dialogue. */
async function englishSubtitle(payload: z.infer<typeof sourcePayloadSchema>) {
    const candidates = englishCaptionTracks(payload);
    return fullestCaption(candidates, (url) =>
        requestText(new URL(url), {
            accept: 'text/vtt',
            referer: `${megaplayUrl}/`,
        })
    );
}

async function resolveStream(embed: URL) {
    const id = sourceId(await requestText(embed, { referer: `${baseUrl}/` }));
    if (!id) {
        throw new Error('AniKoto MegaPlay embed returned no source ID');
    }

    const sourceUrl = new URL('/stream/getSources', megaplayUrl);
    sourceUrl.searchParams.set('id', id);
    const parsed = sourcePayloadSchema.safeParse(await requestJson(sourceUrl, embed.toString()));
    if (!parsed.success) {
        throw new Error('AniKoto MegaPlay embed returned no HLS stream');
    }
    const payload = parsed.data;
    const streamUrl = supportedMediaUrl(payload.sources.file);
    if (!streamUrl || !streamUrl.pathname.endsWith('.m3u8')) {
        throw new Error('AniKoto MegaPlay embed returned no HLS stream');
    }

    return {
        url: streamUrl.toString(),
        quality: null,
        subtitleUrl: await englishSubtitle(payload),
    } satisfies ProviderStream;
}

async function getStreams(
    anime: AniListAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[]
) {
    let match: AniKotoEpisode | undefined;
    let parentError: unknown;

    try {
        const { episodes } = await providerSeries(anime);
        match = matchProviderStreamEpisode(episodes, episode, anime.episodes);
    } catch (cause) {
        parentError = cause;
    }

    if (!match && isSpecialEpisodeReference(episode)) {
        try {
            match = await specialReleaseEpisode(anime, episode);
        } catch (cause) {
            throw new AggregateError(
                parentError ? [parentError, cause] : [cause],
                `AniKoto could not resolve special ${episode.title || episode.id}`
            );
        }
    }

    if (!match) {
        if (parentError) {
            throw parentError;
        }
        throw new Error(`AniKoto has no episode ${episode.number} for AniList ${anime.id}`);
    }

    const requested = [...new Set(modes)].flatMap((mode) => {
        if (mode === 'raw') {
            return [];
        }

        const embed = validEmbed(match.embeds[mode], mode);
        return embed ? [{ mode, embed }] : [];
    });
    return settledStreams(
        requested.map(async ({ mode, embed }) => ({
            mode,
            stream: await resolveStream(embed),
        })),
        `AniKoto returned no ${modes.join('/')} stream for episode ${episode.id}`
    );
}

export const anikotoProvider: PlaybackProvider = {
    name: 'AniKoto',
    getEpisodes,
    getStreams,
};
