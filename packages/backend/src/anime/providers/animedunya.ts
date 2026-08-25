import { z } from 'zod';

import type { AniListAnime } from '../anilist/types';
import type { AudioMode } from '@arc/shared/audio';
import { matchProviderStreamEpisode } from './match';
import type { PlaybackProvider, ProviderEpisode, ProviderStream } from './types';

const baseUrl = 'https://anime-dunya.com';
const providerName = 'AnimeDunya';
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const translationSchema = z.union([
    z.array(z.object({ language: z.string(), title: z.string().optional() })),
    z.object({ title: z.string().optional() }),
]);
const episodeSchema = z.object({
    episodeNumber: z.union([z.number(), z.string()]),
    streamId: z.union([z.number(), z.string()]).nullable().optional(),
    filler: z.boolean().optional(),
    translations: translationSchema.optional(),
});
const streamSchema = z.object({
    source: z.string(),
    subtitles: z
        .array(
            z.object({
                src: z.string(),
                label: z.string().optional(),
                srclang: z.string().optional(),
                default: z.boolean().optional(),
            })
        )
        .optional(),
});

async function requestText(url: URL, referer = `${baseUrl}/`) {
    const response = await fetch(url, {
        headers: {
            Accept: 'text/html,application/xhtml+xml',
            Referer: referer,
            'User-Agent': userAgent,
        },
        signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`AnimeDunya returned ${response.status} for ${url.pathname}`);
    return response.text();
}

function malId(anime: AniListAnime) {
    if (!anime.idMal || anime.idMal <= 0)
        throw new Error(`AnimeDunya requires a MAL ID for AniList ${anime.id}`);
    return anime.idMal;
}

function embeddedValue(html: string, key: string) {
    const match = html.match(new RegExp(`\\\\?"${key}\\\\?"\\s*:\\s*`));
    if (!match || match.index === undefined) return null;
    const start = match.index + match[0].length;
    const opening = html[start];
    if (opening !== '[' && opening !== '{') return null;
    let depth = 0;
    let quote = false;
    let escaped = false;
    for (let index = start; index < html.length; index++) {
        const char = html[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quote = false;
            continue;
        }
        if (char === '"') quote = true;
        else if (char === '[' || char === '{') depth++;
        else if (char === ']' || char === '}') depth--;
        if (depth === 0) {
            try {
                return JSON.parse(
                    html
                        .slice(start, index + 1)
                        .replaceAll('\\u0026', '&')
                        .replaceAll('\\"', '"')
                );
            } catch {
                return null;
            }
        }
    }
    return null;
}

export function parseAnimeDunyaEpisodes(html: string) {
    const value = embeddedValue(html, 'episodes');
    const parsed = z.array(episodeSchema).safeParse(value);
    if (!parsed.success) return [];
    return parsed.data
        .flatMap((episode) => {
            const number = Number(episode.episodeNumber);
            const streamId = episode.streamId == null ? null : String(episode.streamId);
            if (!Number.isSafeInteger(number) || number <= 0 || !streamId) return [];
            const translation = Array.isArray(episode.translations)
                ? episode.translations.find((item) => item.language.toLowerCase() === 'en')?.title
                : episode.translations?.title;
            return [{ number, streamId, title: translation?.trim() || `Episode ${number}` }];
        })
        .sort((left, right) => left.number - right.number);
}

function parseStream(html: string) {
    const parsed = streamSchema.safeParse(embeddedValue(html, 'stream'));
    if (!parsed.success) return null;
    try {
        const source = new URL(parsed.data.source);
        if (source.protocol !== 'https:') return null;
        const subtitleUrl = parsed.data.subtitles?.find((track) =>
            /^(?:en|eng)$/i.test(track.srclang ?? '')
        )?.src;
        const subtitle = subtitleUrl ? new URL(subtitleUrl) : null;
        if (subtitle && subtitle.protocol !== 'https:') return null;
        return { url: source.toString(), subtitleUrl: subtitle?.toString() ?? null };
    } catch {
        return null;
    }
}

async function getEpisodes(anime: AniListAnime) {
    const id = malId(anime);
    const parsed = parseAnimeDunyaEpisodes(await requestText(new URL(`/en/anime/${id}`, baseUrl)));
    if (!parsed.length) throw new Error(`AnimeDunya returned no episodes for MAL ${id}`);
    return parsed.map((episode): ProviderEpisode => ({
        id: String(episode.number),
        number: episode.number,
        title: episode.title,
        audio: ['sub'],
    }));
}

async function getStreams(
    anime: AniListAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[]
) {
    if (!modes.includes('sub') || modes.every((mode) => mode === 'raw' || mode === 'dub'))
        return {};
    const all = await getEpisodes(anime);
    const match = matchProviderStreamEpisode(all, episode, anime.episodes);
    if (!match)
        throw new Error(`AnimeDunya cannot map episode ${episode.id} for AniList ${anime.id}`);
    const stream = parseStream(
        await requestText(new URL(`/en/play/${malId(anime)}/${match.number}`, baseUrl))
    );
    if (!stream) throw new Error(`AnimeDunya returned no stream for episode ${episode.id}`);
    const value: ProviderStream = { ...stream, quality: null, provider: providerName };
    return { sub: [value] };
}

export const animeDunyaProvider: PlaybackProvider = { name: 'AnimeDunya', getEpisodes, getStreams };
