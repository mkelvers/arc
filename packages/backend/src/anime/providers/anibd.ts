import { z } from 'zod';

import type { AniListAnime } from '../anilist/types';
import type { AudioMode } from '@arc/shared/audio';
import type { JsonValue } from '#utils';
import { matchProviderStreamEpisode } from './match';
import type { PlaybackProvider, ProviderEpisode, ProviderStream } from './types';

const baseUrl = 'https://epeng.animeapps.top';
const providerName = 'AniBD';
const jsonSchema = z.json();
const episodeSchema = z.object({
    name: z.union([z.string(), z.number()]).optional(),
    slug: z.union([z.string(), z.number()]).optional(),
    link: z.string(),
});
const groupSchema = z.object({
    server_name: z.string().optional(),
    server_data: z.array(episodeSchema).optional(),
});
const playerSchema = z.object({ link: z.string(), server: z.string().optional() });

interface AniBDEpisode extends ProviderEpisode {
    sourceLinks: Partial<Record<AudioMode, string>>;
}

async function requestJson(url: URL) {
    const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`AniBD returned ${response.status} for ${url.pathname}`);
    const parsed = jsonSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('AniBD returned invalid JSON');
    return parsed.data;
}

async function requestText(url: URL, referer: URL) {
    const response = await fetch(url, {
        headers: { Accept: 'text/html,application/xhtml+xml', Referer: referer.toString() },
        signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`AniBD returned ${response.status} for ${url.pathname}`);
    return response.text();
}

function mode(name: string) {
    return /dub/i.test(name) ? ('dub' as const) : ('sub' as const);
}

export function parseAniBDGroups(value: JsonValue) {
    const parsed = z.array(groupSchema).safeParse(value);
    return parsed.success ? parsed.data : [];
}

function episodes(value: JsonValue) {
    const groups = parseAniBDGroups(value);
    const byNumber = new Map<number, AniBDEpisode>();
    for (const group of groups) {
        const audio = mode(group.server_name ?? '');
        for (const item of group.server_data ?? []) {
            const number = Number(item.name ?? item.slug);
            if (!Number.isSafeInteger(number) || number <= 0) continue;
            const existing = byNumber.get(number) ?? {
                id: String(number),
                number,
                title: `Episode ${number}`,
                audio: [],
                sourceLinks: {},
            };
            if (!existing.audio.includes(audio)) existing.audio.push(audio);
            existing.sourceLinks[audio] ??= item.link;
            byNumber.set(number, existing);
        }
    }
    return [...byNumber.values()].sort((left, right) => left.number - right.number);
}

async function inventory(anime: AniListAnime) {
    const parsed = episodes(await requestJson(new URL(`/api2.php?epid=${anime.id}`, baseUrl)));
    if (!parsed.length) throw new Error(`AniBD returned no episodes for AniList ${anime.id}`);
    return parsed;
}

function safeHttps(value: string, base?: URL) {
    try {
        const url = new URL(value, base);
        return url.protocol === 'https:' ? url : null;
    } catch {
        return null;
    }
}

async function playerLinks(link: string) {
    const providerLink = safeHttps(link);
    if (!providerLink) return [];
    const players = z
        .array(playerSchema)
        .safeParse(
            await requestJson(
                new URL(`/apilink.php?data=${encodeURIComponent(providerLink.toString())}`, baseUrl)
            )
        );
    if (!players.success) return [];
    return players.data;
}

async function resolvePlayer(player: z.infer<typeof playerSchema>): Promise<ProviderStream | null> {
    const playerUrl = safeHttps(player.link);
    if (!playerUrl) return null;
    let html = '';
    try {
        html = await requestText(playerUrl, new URL(`${playerUrl.origin}/`));
    } catch {
        return {
            url: playerUrl.toString(),
            kind: 'iframe',
            quality: null,
            subtitleUrl: null,
            provider: providerName,
        };
    }
    const raw = html.match(/videoUrl\s*:\s*"([^"]+)"/)?.[1];
    const streamUrl = raw ? safeHttps(raw, playerUrl) : null;
    if (streamUrl) {
        return {
            url: streamUrl.toString(),
            kind: 'direct',
            quality: null,
            subtitleUrl: null,
            provider: providerName,
        };
    }
    return {
        url: playerUrl.toString(),
        kind: 'iframe' as const,
        quality: null,
        subtitleUrl: null,
        provider: providerName,
    } satisfies ProviderStream;
}

async function getEpisodes(anime: AniListAnime) {
    return inventory(anime);
}

async function getStreams(
    anime: AniListAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[]
) {
    const all = await inventory(anime);
    const match = matchProviderStreamEpisode(all, episode, anime.episodes);
    if (!match) throw new Error(`AniBD cannot map episode ${episode.id} for AniList ${anime.id}`);
    const result: Partial<Record<AudioMode, ProviderStream[]>> = {};
    for (const requested of new Set(modes)) {
        if (requested === 'raw' || !match.audio.includes(requested)) continue;
        const link = (all.find((item) => item.number === match.number) as AniBDEpisode).sourceLinks[
            requested
        ];
        if (!link) continue;
        const streams = (
            await Promise.all(
                (await playerLinks(link)).map(async (player) => resolvePlayer(player))
            )
        ).flatMap((stream) => (stream ? [stream] : []));
        if (streams.length) result[requested] = streams;
    }
    if (!Object.keys(result).length)
        throw new Error(`AniBD returned no stream for episode ${episode.id}`);
    return result;
}

export const anibdProvider: PlaybackProvider = { name: 'AniBD', getEpisodes, getStreams };
