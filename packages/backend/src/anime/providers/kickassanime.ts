import { z } from 'zod';

import type { AniListAnime } from '../anilist/types';
import { animeTitles } from '../anilist/text';
import type { AudioMode } from '@arc/shared/audio';
import { matchProviderStreamEpisode } from './match';
import { episodeNumber, httpsUrl, requestJson, requestText, requestedModes } from './anivexa-utils';
import type { PlaybackProvider, ProviderEpisode, ProviderStream } from './types';

const baseUrl = 'https://kaa.lt';
const headers = { Accept: 'application/json, */*' };
const searchSchema = z.object({
    result: z
        .array(
            z.object({
                slug: z.string(),
                title_en: z.string().optional(),
                title: z.string().optional(),
                year: z.unknown().optional(),
                type: z.string().optional(),
            })
        )
        .optional(),
});
const showSchema = z.object({
    type: z.string().optional(),
    locales: z.array(z.string()).optional(),
    watch_uri: z.string().optional(),
});
const pageSchema = z.object({
    result: z
        .array(
            z.object({
                episode_number: z.union([z.string(), z.number()]),
                slug: z.string(),
                title: z.string().optional(),
                duration_ms: z.unknown().optional(),
            })
        )
        .optional(),
    pages: z
        .array(z.object({ eps: z.array(z.union([z.string(), z.number()])).optional() }))
        .optional(),
});
const serversSchema = z.object({
    servers: z.array(z.object({ src: z.string(), name: z.string().optional() })).optional(),
});

interface KaaEpisode extends ProviderEpisode {
    sourceSlug: string;
}

function score(title: string, candidate: string) {
    const left = title
        .toLocaleLowerCase('en')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
    const right = candidate
        .toLocaleLowerCase('en')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) return 0.8;
    return 0;
}

export function mapKaaEpisodes(value: z.input<typeof pageSchema>) {
    const parsed = pageSchema.safeParse(value);
    if (!parsed.success) return [];
    return (
        parsed.data.result
            ?.flatMap((item) => {
                const number = episodeNumber(item.episode_number);
                return number
                    ? [
                          {
                              number,
                              slug: item.slug,
                              title: item.title?.trim() || `Episode ${number}`,
                          },
                      ]
                    : [];
            })
            .sort((left, right) => left.number - right.number) ?? []
    );
}

async function search(query: string) {
    return requestJson(
        new URL('/api/fsearch', baseUrl),
        searchSchema,
        {
            ...headers,
            'Content-Type': 'application/json',
        },
        {
            method: 'POST',
            body: JSON.stringify({ page: 1, query }),
        }
    );
}

async function findSeries(anime: AniListAnime) {
    let best: { slug: string; score: number } | undefined;
    for (const query of animeTitles(anime).slice(0, 4)) {
        const payload = await search(query);
        for (const candidate of payload.result ?? []) {
            const candidateTitle = candidate.title_en ?? candidate.title ?? '';
            const value = Math.max(
                ...animeTitles(anime).map((title) => score(title, candidateTitle))
            );
            if (!best || value > best.score) best = { slug: candidate.slug, score: value };
        }
    }
    if (!best || best.score < 0.8)
        throw new Error(`KickAssAnime has no confident match for AniList ${anime.id}`);
    return best.slug;
}

async function episodePage(slug: string, number: number) {
    return requestJson(
        new URL(`/api/show/${slug}/episodes?ep=${number}&lang=ja-JP`, baseUrl),
        pageSchema,
        headers
    );
}

async function playableManifest(url: URL) {
    const headers = { Accept: 'application/vnd.apple.mpegurl', Referer: `${baseUrl}/` };
    const master = await requestText(url, headers);
    const child = master
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('#'));
    if (!child) {
        return false;
    }

    const media = await requestText(new URL(child, url), headers);
    return !/\.(?:jpe?g|png)(?:[?#]|$)/im.test(media);
}

async function inventory(anime: AniListAnime) {
    const slug = await findSeries(anime);
    const first = await episodePage(slug, 1);
    const pages = first.pages ?? [];
    const batches = [
        first,
        ...(await Promise.all(
            pages.slice(1).map(async (page) => {
                const number = episodeNumber(page.eps?.[0]);
                return number ? episodePage(slug, number) : { result: [] };
            })
        )),
    ];
    const all = batches.flatMap(mapKaaEpisodes);
    const episodes = [...new Map(all.map((episode) => [episode.number, episode])).values()];
    if (!episodes.length)
        throw new Error(`KickAssAnime returned no episodes for AniList ${anime.id}`);
    const show = await requestJson(new URL(`/api/show/${slug}`, baseUrl), showSchema, headers);
    return { slug, episodes, hasDub: show.locales?.includes('en-US') ?? false };
}

async function getEpisodes(anime: AniListAnime) {
    const { episodes, hasDub } = await inventory(anime);
    return episodes.map((episode): KaaEpisode => ({
        id: String(episode.number),
        number: episode.number,
        title: episode.title,
        audio: hasDub ? ['sub', 'dub'] : ['sub'],
        sourceSlug: episode.slug,
    }));
}

async function getStreams(
    anime: AniListAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[]
) {
    const { slug, episodes, hasDub } = await inventory(anime);
    const available = episodes.map((item): KaaEpisode => ({
        id: String(item.number),
        number: item.number,
        title: item.title,
        audio: hasDub ? ['sub', 'dub'] : ['sub'],
        sourceSlug: item.slug,
    }));
    const match = matchProviderStreamEpisode(available, episode, anime.episodes);
    if (!match)
        throw new Error(`KickAssAnime cannot map episode ${episode.id} for AniList ${anime.id}`);
    const payload = await requestJson(
        new URL(`/api/show/${slug}/episode/ep-${match.number}-${match.sourceSlug}`, baseUrl),
        serversSchema,
        headers
    );
    const result: Partial<Record<AudioMode, ProviderStream[]>> = {};
    for (const mode of requestedModes(modes)) {
        if (!match.audio.includes(mode)) continue;
        const streams = (
            await Promise.all(
                (payload.servers ?? []).map(async (server) => {
                    const playerUrl = httpsUrl(server.src);
                    if (!playerUrl) {
                        return null;
                    }

                    try {
                        const html = await requestText(playerUrl, {
                            Accept: 'text/html,application/xhtml+xml',
                            Referer: `${baseUrl}/`,
                        });
                        const encoded = html.match(
                            /&quot;manifest&quot;:\[0,&quot;([^&]+)&quot;/
                        )?.[1];
                        if (!encoded) {
                            return null;
                        }

                        const manifest = encoded.replaceAll('&amp;', '&').replaceAll('&quot;', '"');
                        const url = httpsUrl(
                            manifest.startsWith('//') ? `https:${manifest}` : manifest
                        );
                        return url && (await playableManifest(url))
                            ? {
                                  url: url.toString(),
                                  kind: 'direct' as const,
                                  quality: null,
                                  subtitleUrl: null,
                                  provider: 'KickAssAnime',
                              }
                            : null;
                    } catch {
                        return null;
                    }
                })
            )
        ).flatMap((stream) => (stream ? [stream] : []));
        if (streams.length) result[mode] = streams;
    }
    if (!Object.keys(result).length)
        throw new Error(`KickAssAnime returned no stream for episode ${episode.id}`);
    return result;
}

export const kickAssAnimeProvider: PlaybackProvider = {
    name: 'KickAssAnime',
    getEpisodes,
    getStreams,
};
