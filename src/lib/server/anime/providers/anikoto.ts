import { load } from 'cheerio';

import type { AudioMode } from '$lib/anime/audio';
import {
    providerMediaId,
    saveProviderMediaId,
    verifyProviderMediaId,
} from './mapping';
import { normalizedProviderTitle, providerTitles } from './match';
import type {
    PlaybackProvider,
    ProviderAnime,
    ProviderEpisode,
    ProviderStream,
    ProviderStreams,
} from './types';

const baseUrl = 'https://anikototv.to';
const catalogUrl = 'https://anikotoapi.site';
const megaplayUrl = 'https://megaplay.buzz';
const providerName = 'anikoto';
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

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
        readonly status: number,
    ) {
        super(message);
    }
}

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
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
    } = {},
) {
    const response = await fetch(url, {
        headers: {
            Accept: accept,
            Referer: referer,
            'User-Agent': userAgent,
            ...(xhr ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
        },
        signal: AbortSignal.timeout(8_000),
    });
    const text = await response.text();

    if (!response.ok) {
        throw new AniKotoRequestError(
            `AniKoto returned ${response.status} for ${url.hostname}${url.pathname}`,
            response.status,
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
        return JSON.parse(text) as unknown;
    } catch (cause) {
        throw new Error('AniKoto returned an invalid JSON response', {
            cause,
        });
    }
}

function positiveInteger(value: unknown) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function searchCandidates(html: string) {
    const $ = load(html);
    const candidates = new Map<number, SearchCandidate>();

    $('.main .item').each((_, element) => {
        const item = $(element);
        const id = positiveInteger(
            item.find('.poster[data-tip]').first().attr('data-tip'),
        );
        const titleElement = item.find('.name').first();
        const title = titleElement.text().trim();
        const alternativeTitle = titleElement.attr('data-jp')?.trim() ?? '';

        if (id && title) {
            candidates.set(id, { id, title, alternativeTitle });
        }
    });

    return [...candidates.values()];
}

function episodeTitle(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) {
        return '';
    }

    return load(`<span>${value}</span>`)('span').text().trim();
}

function parseSeries(value: unknown): AniKotoSeries | null {
    const payload = record(value);
    const data = record(payload?.data);
    const anime = record(data?.anime);
    const id = positiveInteger(anime?.id);
    if (
        !payload?.ok ||
        !data ||
        !anime ||
        !id ||
        !Array.isArray(data.episodes)
    ) {
        return null;
    }

    const episodes = data.episodes.flatMap((value) => {
        const episode = record(value);
        const embedUrls = record(episode?.embed_url);
        const number = Number(episode?.number);
        const embedId = episode?.episode_embed_id;
        if (
            !Number.isFinite(number) ||
            number <= 0 ||
            typeof embedId !== 'string' ||
            !embedId
        ) {
            return [];
        }

        const embeds: AniKotoEpisode['embeds'] = {};
        if (typeof embedUrls?.sub === 'string' && embedUrls.sub) {
            embeds.sub = embedUrls.sub;
        }
        if (typeof embedUrls?.dub === 'string' && embedUrls.dub) {
            embeds.dub = embedUrls.dub;
        }

        return [
            {
                embedId,
                number,
                title: episodeTitle(episode?.title),
                embeds,
            },
        ];
    });

    return {
        id,
        anilistId: positiveInteger(anime.ani_id),
        malId: positiveInteger(anime.mal_id),
        title: typeof anime.title === 'string' ? anime.title.trim() : '',
        episodes,
    };
}

async function loadSeries(id: number) {
    const value = await requestJson(
        new URL(`/series/${id}`, catalogUrl),
        `${baseUrl}/`,
    );
    const series = parseSeries(value);
    if (!series || series.id !== id) {
        throw new Error('AniKoto returned an invalid series response');
    }

    return series;
}

function exactIdentity(series: AniKotoSeries, anime: ProviderAnime) {
    if (series.anilistId !== null) {
        return series.anilistId === anime.id;
    }

    return Boolean(
        anime.idMal && series.malId !== null && series.malId === anime.idMal,
    );
}

async function search(title: string) {
    const url = new URL('/filter', baseUrl);
    url.searchParams.set('keyword', title);
    return searchCandidates(await requestText(url));
}

async function matchingSeries(
    candidates: SearchCandidate[],
    anime: ProviderAnime,
) {
    const titles = new Set(providerTitles(anime).map(normalizedProviderTitle));
    const exact = candidates.filter(
        (candidate) =>
            titles.has(normalizedProviderTitle(candidate.title)) ||
            titles.has(normalizedProviderTitle(candidate.alternativeTitle)),
    );
    const ordered = [
        ...exact,
        ...candidates.filter((candidate) => !exact.includes(candidate)),
    ];

    for (let offset = 0; offset < ordered.length; offset += 12) {
        const batch = await Promise.allSettled(
            ordered
                .slice(offset, offset + 12)
                .map((candidate) => loadSeries(candidate.id)),
        );
        const match = batch.find(
            (result): result is PromiseFulfilledResult<AniKotoSeries> =>
                result.status === 'fulfilled' &&
                exactIdentity(result.value, anime),
        );
        if (match) {
            return match.value;
        }
    }

    return null;
}

async function findSeries(anime: ProviderAnime, refresh = false) {
    if (!refresh) {
        const stored = positiveInteger(
            await providerMediaId(anime.id, providerName),
        );
        if (stored) {
            try {
                const series = await loadSeries(stored);
                if (exactIdentity(series, anime)) {
                    await verifyProviderMediaId(anime.id, providerName);
                    return series;
                }
            } catch (cause) {
                if (
                    !(cause instanceof AniKotoRequestError) ||
                    cause.status !== 404
                ) {
                    throw cause;
                }
            }
        }
    }

    const results = await Promise.allSettled(
        providerTitles(anime).slice(0, 6).map(search),
    );
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
        throw new Error(
            `AniKoto has no exact identity match for AniList ${anime.id}`,
        );
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
        return url.protocol === 'https:' &&
            url.hostname === 'megaplay.buzz' &&
            match?.[2] === mode
            ? url
            : null;
    } catch {
        return null;
    }
}

function episodeModes(episode: AniKotoEpisode) {
    return (['sub', 'dub'] as const).filter((mode) =>
        Boolean(validEmbed(episode.embeds[mode], mode)),
    );
}

async function providerSeries(anime: ProviderAnime) {
    const series = await findSeries(anime);
    const episodes = series.episodes
        .filter((episode) => episodeModes(episode).length)
        .sort((left, right) => left.number - right.number);
    if (!episodes.length) {
        throw new Error(
            `AniKoto returned no playable episodes for AniList ${anime.id}`,
        );
    }

    return { series, episodes };
}

async function getEpisodes(anime: ProviderAnime) {
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

function supportedMediaUrl(value: unknown) {
    if (typeof value !== 'string') {
        return null;
    }

    try {
        const url = new URL(value);
        const supported =
            url.hostname === 'megap.kotocdn.site' ||
            url.hostname.endsWith('.megap.kotocdn.site') ||
            url.hostname === 'lostproject.club' ||
            url.hostname.endsWith('.lostproject.club');
        return url.protocol === 'https:' && supported ? url : null;
    } catch {
        return null;
    }
}

function englishSubtitle(payload: Record<string, unknown>) {
    if (!Array.isArray(payload.tracks)) {
        return null;
    }

    for (const value of payload.tracks) {
        const track = record(value);
        const kind =
            typeof track?.kind === 'string' ? track.kind.toLowerCase() : '';
        const label =
            typeof track?.label === 'string' ? track.label.toLowerCase() : '';
        if (kind !== 'captions' || !/\benglish\b/.test(label)) {
            continue;
        }

        const url = supportedMediaUrl(track?.file);
        if (url) {
            return url.toString();
        }
    }

    return null;
}

async function resolveStream(embedValue: string, mode: 'sub' | 'dub') {
    const embed = validEmbed(embedValue, mode);
    if (!embed) {
        throw new Error(`AniKoto returned an invalid ${mode} embed`);
    }

    const id = sourceId(await requestText(embed, { referer: `${baseUrl}/` }));
    if (!id) {
        throw new Error('AniKoto MegaPlay embed returned no source ID');
    }

    const sourceUrl = new URL('/stream/getSources', megaplayUrl);
    sourceUrl.searchParams.set('id', id);
    const payload = record(await requestJson(sourceUrl, embed.toString()));
    const sources = record(payload?.sources);
    const streamUrl = supportedMediaUrl(sources?.file);
    if (!payload || !streamUrl || !streamUrl.pathname.endsWith('.m3u8')) {
        throw new Error('AniKoto MegaPlay embed returned no HLS stream');
    }

    return {
        url: streamUrl.toString(),
        quality: null,
        audioDelay: 0,
        subtitleUrl: mode === 'sub' ? englishSubtitle(payload) : null,
    } satisfies ProviderStream;
}

async function getStreams(
    anime: ProviderAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[],
) {
    if (!Number.isFinite(episode.number) || episode.number <= 0) {
        throw new Error(
            `AniKoto cannot map episode ${episode.id} to a positive number`,
        );
    }

    const { episodes } = await providerSeries(anime);
    const match = episodes.find(
        (candidate) => candidate.number === episode.number,
    );
    if (!match) {
        throw new Error(
            `AniKoto has no episode ${episode.number} for AniList ${anime.id}`,
        );
    }

    const requested = [...new Set(modes)].filter(
        (mode): mode is 'sub' | 'dub' =>
            mode !== 'raw' && Boolean(validEmbed(match.embeds[mode], mode)),
    );
    const results = await Promise.allSettled(
        requested.map(async (mode) => ({
            mode,
            stream: await resolveStream(match.embeds[mode]!, mode),
        })),
    );
    const streams: ProviderStreams = {};
    const errors: unknown[] = [];

    for (const result of results) {
        if (result.status === 'rejected') {
            errors.push(result.reason);
            continue;
        }

        streams[result.value.mode] = [result.value.stream];
    }

    if (!Object.keys(streams).length) {
        throw new AggregateError(
            errors,
            `AniKoto returned no ${modes.join('/')} stream for episode ${episode.id}`,
        );
    }

    return streams;
}

export const anikotoProvider: PlaybackProvider = {
    name: 'AniKoto',
    getEpisodes,
    getStreams,
};
