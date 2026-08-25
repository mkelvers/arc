import { z } from 'zod';

import type { AniListAnime } from '../anilist/types';
import type { AudioMode } from '@arc/shared/audio';
import { matchProviderStreamEpisode } from './match';
import type { PlaybackProvider, ProviderEpisode, ProviderStream } from './types';

const baseUrl = 'https://2dhive.com';
const providerName = '2dhive';
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const serverSchema = z.object({
    server_name: z.string().optional(),
    slug: z.string(),
    dub: z.boolean().optional(),
});
const playerSchema = z.object({
    prefetchedHls: z.record(z.string(), z.object({ content: z.string().optional() })).optional(),
    servers: z.array(serverSchema).optional(),
});

interface HiveEpisode extends ProviderEpisode {
    number: number;
}

async function requestText(url: URL, referer = `${baseUrl}/`) {
    const response = await fetch(url, {
        headers: {
            Accept: 'text/html,application/xhtml+xml',
            Referer: referer,
            'User-Agent': userAgent,
        },
        signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
        throw new Error(`2dhive returned ${response.status} for ${url.pathname}`);
    }
    return response.text();
}

function decodeHtml(value: string) {
    return value
        .replaceAll('&quot;', '"')
        .replaceAll('&amp;', '&')
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>');
}

function jsonAttribute(html: string, component: string) {
    const match = html.match(
        new RegExp(`<astro-island[^>]+component-url="[^"]*${component}[^"]*"[^>]+props="([^"]+)"`)
    );
    if (!match) return null;
    try {
        return JSON.parse(decodeHtml(match[1]));
    } catch {
        return null;
    }
}

export function parse2dhiveEpisodeNumbers(html: string, malId: number) {
    const numbers = new Set<number>();
    const pattern = new RegExp(`/episode\\?anime=${malId}&(?:amp;)?ep_num=(\\d+)`, 'gi');
    for (const match of html.matchAll(pattern)) {
        const number = Number(match[1]);
        if (Number.isSafeInteger(number) && number > 0) numbers.add(number);
    }
    return [...numbers].sort((left, right) => left - right);
}

function playerProps(html: string) {
    const raw = jsonAttribute(html, 'EpisodePlayer');
    const parsed = playerSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
}

async function malId(anime: AniListAnime) {
    if (!anime.idMal || anime.idMal <= 0) {
        throw new Error(`2dhive requires a MAL ID for AniList ${anime.id}`);
    }
    return anime.idMal;
}

async function loadEpisodes(anime: AniListAnime) {
    const id = await malId(anime);
    const html = await requestText(new URL(`/anime?anime=${id}`, baseUrl));
    const numbers = parse2dhiveEpisodeNumbers(html, id);
    if (!numbers.length) throw new Error(`2dhive returned no episodes for MAL ${id}`);

    const first = await requestText(new URL(`/episode?anime=${id}&ep_num=${numbers[0]}`, baseUrl));
    const props = playerProps(first);
    const hasDub =
        Boolean(props?.prefetchedHls?.dub?.content) ||
        Boolean(props?.servers?.some((server) => server.dub === true));
    return { id, numbers, hasDub };
}

async function getEpisodes(anime: AniListAnime) {
    const { numbers, hasDub } = await loadEpisodes(anime);
    return numbers.map((number): HiveEpisode => ({
        id: String(number),
        number,
        title: `Episode ${number}`,
        audio: hasDub ? ['sub', 'dub'] : ['sub'],
    }));
}

function safeHttps(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.toString() : null;
    } catch {
        return null;
    }
}

async function getStreams(
    anime: AniListAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[]
) {
    const inventory = await loadEpisodes(anime);
    const available = inventory.numbers.map((number): HiveEpisode => ({
        id: String(number),
        number,
        title: `Episode ${number}`,
        audio: inventory.hasDub ? ['sub', 'dub'] : ['sub'],
    }));
    const match = matchProviderStreamEpisode(available, episode, anime.episodes);
    if (!match || !inventory.numbers.includes(match.number)) {
        throw new Error(`2dhive cannot map episode ${episode.id} for AniList ${anime.id}`);
    }

    const page = new URL(`/episode?anime=${inventory.id}&ep_num=${match.number}`, baseUrl);
    const props = playerProps(await requestText(page));
    const servers = props?.servers ?? [];
    const result: Partial<Record<AudioMode, ProviderStream[]>> = {};
    for (const mode of new Set(modes)) {
        if (mode === 'raw' || !match.audio.includes(mode)) continue;
        const streams = servers
            .filter((server) => Boolean(server.dub) === (mode === 'dub'))
            .flatMap((server): ProviderStream[] => {
                const url = safeHttps(server.slug);
                return url
                    ? [
                          {
                              url,
                              kind: 'iframe',
                              quality: null,
                              subtitleUrl: null,
                              provider: providerName,
                          },
                      ]
                    : [];
            });
        if (streams.length) result[mode] = streams;
    }
    if (!Object.keys(result).length)
        throw new Error(`2dhive returned no stream for episode ${episode.id}`);
    return result;
}

export const twoDHiveProvider: PlaybackProvider = {
    name: '2dhive',
    providesEpisodeInventory: false,
    getEpisodes,
    getStreams,
};
