import { env } from '$env/dynamic/private';
import { load } from 'cheerio';

import type { AudioMode } from '$lib/anime/audio';
import { record } from '$lib/utils';
import { settledStreams } from './fallback';
import {
    providerMediaId,
    saveProviderMediaId,
    verifyProviderMediaId,
} from './mapping';
import {
    matchProviderEpisode,
    normalizedProviderTitle,
    providerTitles,
} from './match';
import type {
    PlaybackProvider,
    ProviderEpisode,
    ProviderStream,
    ProviderStreams,
} from './types';

const baseUrl = 'https://anidb.app';
const providerName = 'anidb';
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

interface AniDbEpisode {
    providerId: number;
    number: number;
    title: string;
}

class AniDbRequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

function requestHeaders(accept: string) {
    return {
        Accept: accept,
        Referer: `${baseUrl}/`,
        'User-Agent': userAgent,
        ...(env.ANIDB_COOKIE
            ? { Cookie: env.ANIDB_COOKIE.trim() }
            : {}),
    };
}

async function requestText(path: string, accept: string) {
    const url = new URL(path, baseUrl);
    const response = await fetch(url, {
        headers: requestHeaders(accept),
        signal: AbortSignal.timeout(8_000),
    });
    const text = await response.text();
    const challenged =
        response.headers.get('cf-mitigated') === 'challenge' ||
        /<title>\s*Just a moment/i.test(text) ||
        /challenges\.cloudflare\.com/i.test(text);

    if (challenged) {
        throw new AniDbRequestError(
            'AniDB requires a valid Cloudflare clearance session; configure ANIDB_COOKIE or use the next provider',
            response.status,
        );
    }

    if (!response.ok) {
        throw new AniDbRequestError(
            `AniDB returned ${response.status} for ${url.pathname}`,
            response.status,
        );
    }

    return text;
}

async function requestJson(path: string) {
    const text = await requestText(path, 'application/json');

    try {
        return JSON.parse(text) as unknown;
    } catch (cause) {
        throw new Error('AniDB returned an invalid JSON response', {
            cause,
        });
    }
}

function searchCandidates(html: string) {
    const $ = load(html);
    const candidates = new Map<
        number,
        { id: number; title: string; path: string }
    >();

    $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        const title = $(element).find('img[alt]').attr('alt')?.trim();
        if (!href || !title) {
            return;
        }

        const url = new URL(href, baseUrl);
        const match = url.pathname.match(/^\/anime\/.+-(\d+)$/);
        const id = Number(match?.[1]);
        if (
            url.origin !== baseUrl ||
            !Number.isSafeInteger(id) ||
            id <= 0
        ) {
            return;
        }

        candidates.set(id, { id, title, path: url.pathname });
    });

    return [...candidates.values()];
}

function pageIdentity(html: string) {
    const $ = load(html);
    let anilistId: number | null = null;
    let malId: number | null = null;

    $('a[href]').each((_, element) => {
        const href = $(element).attr('href') ?? '';
        const anilist = href.match(
            /^https:\/\/anilist\.co\/anime\/(\d+)/,
        );
        const mal = href.match(
            /^https:\/\/myanimelist\.net\/anime\/(\d+)/,
        );

        if (anilist) {
            anilistId = Number(anilist[1]);
        }
        if (mal) {
            malId = Number(mal[1]);
        }
    });

    return { anilistId, malId };
}

function exactIdentity(
    identity: ReturnType<typeof pageIdentity>,
    anime: Parameters<PlaybackProvider['getEpisodes']>[0],
) {
    if (
        identity.anilistId !== null &&
        identity.anilistId !== anime.id
    ) {
        return false;
    }
    if (
        identity.malId !== null &&
        anime.idMal &&
        identity.malId !== anime.idMal
    ) {
        return false;
    }

    return (
        identity.anilistId === anime.id ||
        Boolean(anime.idMal && identity.malId === anime.idMal)
    );
}

async function findAnimeId(
    anime: Parameters<PlaybackProvider['getEpisodes']>[0],
    refresh = false,
) {
    if (!refresh) {
        const stored = await providerMediaId(anime.id, providerName);
        const id = Number(stored);
        if (Number.isSafeInteger(id) && id > 0) {
            return id;
        }
    }

    const titles = providerTitles(anime);
    const normalized = new Set(titles.map(normalizedProviderTitle));
    const visited = new Set<number>();

    for (const title of titles) {
        const search = new URL('/browse', baseUrl);
        search.searchParams.set('q', title);
        const candidates = searchCandidates(
            await requestText(
                `${search.pathname}${search.search}`,
                'text/html',
            ),
        ).filter(
            (candidate) =>
                normalized.has(
                    normalizedProviderTitle(candidate.title),
                ) &&
                !visited.has(candidate.id),
        );

        for (const candidate of candidates.slice(0, 6)) {
            visited.add(candidate.id);
            const identity = pageIdentity(
                await requestText(candidate.path, 'text/html'),
            );
            if (!exactIdentity(identity, anime)) {
                continue;
            }

            await saveProviderMediaId(
                anime.id,
                providerName,
                String(candidate.id),
            );
            return candidate.id;
        }
    }

    throw new Error(
        `AniDB has no exact identity match for AniList ${anime.id}`,
    );
}

async function loadEpisodes(animeId: number) {
    const payload = record(
        await requestJson(`/api/frontend/anime/${animeId}/episodes`),
    );
    if (!Array.isArray(payload?.episodes)) {
        throw new Error('AniDB returned an invalid episode inventory');
    }

    const episodes = new Map<number, AniDbEpisode>();
    for (const value of payload.episodes) {
        const episode = record(value);
        const providerId = Number(episode?.id);
        const number = Number(episode?.number);

        if (
            !Number.isSafeInteger(providerId) ||
            providerId <= 0 ||
            !Number.isFinite(number) ||
            number <= 0
        ) {
            continue;
        }

        episodes.set(number, {
            providerId,
            number,
            title:
                typeof episode?.title === 'string'
                    ? episode.title.trim()
                    : '',
        });
    }

    return [...episodes.values()].sort(
        (left, right) => left.number - right.number,
    );
}

async function providerEpisodes(
    anime: Parameters<PlaybackProvider['getEpisodes']>[0],
) {
    let animeId = await findAnimeId(anime);
    let episodes: AniDbEpisode[];

    try {
        episodes = await loadEpisodes(animeId);
    } catch (cause) {
        if (
            !(cause instanceof AniDbRequestError) ||
            cause.status !== 404
        ) {
            throw cause;
        }

        animeId = await findAnimeId(anime, true);
        episodes = await loadEpisodes(animeId);
    }

    if (!episodes.length) {
        throw new Error(
            `AniDB returned an empty episode inventory for AniList ${anime.id}`,
        );
    }

    await verifyProviderMediaId(anime.id, providerName);
    return { animeId, episodes };
}

async function getEpisodes(
    anime: Parameters<PlaybackProvider['getEpisodes']>[0],
) {
    const { episodes } = await providerEpisodes(anime);

    return episodes.map(
        (episode): ProviderEpisode => ({
            id: String(episode.number),
            number: episode.number,
            title: episode.title,
            // AniDB exposes exact languages on the episode endpoint used
            // during playback, so inventory makes only the safe sub claim.
            audio: ['sub'],
        }),
    );
}

function languageMode(value: Record<string, unknown>) {
    const code =
        typeof value.code === 'string' ? value.code.toLowerCase() : '';
    const name =
        typeof value.name === 'string' ? value.name.toLowerCase() : '';

    if (code === 'dub' || name.includes('english')) {
        return 'dub' as const;
    }
    if (code === 'sub' || name.includes('japanese')) {
        return 'sub' as const;
    }

    return null;
}

function hlsStream(html: string): ProviderStream {
    const $ = load(html);
    const script = $('script')
        .map((_, element) => $(element).text())
        .get()
        .join('\n')
        .replaceAll('\\/', '/');
    const match = script.match(
        /https:\/\/hls\.anidb\.app\/[^"'\\\s<]+?\.m3u8(?:\?[^"'\\\s<]*)?/i,
    );

    if (!match) {
        throw new Error('AniDB embed returned no HLS stream');
    }

    const url = new URL(match[0].replaceAll('&amp;', '&'));
    if (url.protocol !== 'https:' || url.hostname !== 'hls.anidb.app') {
        throw new Error('AniDB embed returned an unsupported stream host');
    }

    return {
        url: url.toString(),
        quality: null,
        audioDelay: 0,
    };
}

async function getStreams(
    anime: Parameters<PlaybackProvider['getStreams']>[0],
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[],
) {
    const { episodes } = await providerEpisodes(anime);
    const match = matchProviderEpisode(
        episodes.map((candidate) => ({
            ...candidate,
            id: String(candidate.providerId),
            audio: [] as AudioMode[],
        })),
        episode,
    );
    if (!match) {
        throw new Error(
            `AniDB has no episode ${episode.number} for AniList ${anime.id}`,
        );
    }

    const payload = record(
        await requestJson(
            `/api/frontend/episode/${match.providerId}/languages`,
        ),
    );
    if (!Array.isArray(payload?.languages)) {
        throw new Error('AniDB returned an invalid language response');
    }

    const requested = new Set(modes);
    const languages = payload.languages.flatMap((value) => {
        const language = record(value);
        const mode = language ? languageMode(language) : null;
        const embed = language?.embed_url;

        if (
            !mode ||
            !requested.has(mode) ||
            typeof embed !== 'string'
        ) {
            return [];
        }

        const url = new URL(embed, baseUrl);
        return url.origin === baseUrl && url.pathname.startsWith('/embed/')
            ? [{ mode, path: `${url.pathname}${url.search}` }]
            : [];
    });
    return settledStreams(
        languages.map(async ({ mode, path }) => ({
            mode,
            stream: hlsStream(await requestText(path, 'text/html')),
        })),
        `AniDB returned no ${modes.join('/')} stream for episode ${episode.id}`,
    );
}

export const anidbProvider: PlaybackProvider = {
    name: 'AniDB',
    getEpisodes,
    getStreams,
};
