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
    showSlug: string;
    sourceSlugs: Partial<Record<AudioMode, string>>;
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

async function episodePage(slug: string, number: number, locale: 'en-US' | 'ja-JP') {
    return requestJson(
        new URL(`/api/show/${slug}/episodes?ep=${number}&lang=${locale}`, baseUrl),
        pageSchema,
        headers
    );
}

async function episodesForLocale(slug: string, locale: 'en-US' | 'ja-JP') {
    const first = await episodePage(slug, 1, locale);
    const pages = first.pages ?? [];
    const responses = [
        first,
        ...(await Promise.all(
            pages.slice(1).map(async (page) => {
                const number = episodeNumber(page.eps?.[0]);
                return number ? episodePage(slug, number, locale) : { result: [] };
            })
        )),
    ];
    const episodes = responses.flatMap(mapKaaEpisodes);
    return [...new Map(episodes.map((episode) => [episode.number, episode])).values()];
}

async function playableManifest(url: URL) {
    const headers = {
        Accept: 'application/vnd.apple.mpegurl',
        Referer: 'https://krussdomi.com/',
    };
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

async function loadInventory(anime: AniListAnime) {
    const slug = await findSeries(anime);
    const show = await requestJson(new URL(`/api/show/${slug}`, baseUrl), showSchema, headers);
    const [sub, dub] = await Promise.all([
        episodesForLocale(slug, 'ja-JP'),
        show.locales?.includes('en-US') ? episodesForLocale(slug, 'en-US') : Promise.resolve([]),
    ]);
    const episodes = new Map<number, KaaEpisode>();
    for (const [mode, available] of [
        ['sub', sub],
        ['dub', dub],
    ] as const) {
        for (const episode of available) {
            const existing = episodes.get(episode.number) ?? {
                id: String(episode.number),
                number: episode.number,
                title: episode.title,
                audio: [],
                showSlug: slug,
                sourceSlugs: {},
            };
            existing.sourceSlugs[mode] = episode.slug;
            existing.audio.push(mode);
            episodes.set(episode.number, existing);
        }
    }
    const available = [...episodes.values()].toSorted((left, right) => left.number - right.number);
    if (!available.length)
        throw new Error(`KickAssAnime returned no episodes for AniList ${anime.id}`);
    return available;
}

function inventory(anime: AniListAnime) {
    return loadInventory(anime);
}

async function getEpisodes(anime: AniListAnime) {
    return inventory(anime);
}

async function getStreams(
    anime: AniListAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[]
) {
    const episodes = await inventory(anime);
    const match = matchProviderStreamEpisode(episodes, episode, anime.episodes);
    if (!match)
        throw new Error(`KickAssAnime cannot map episode ${episode.id} for AniList ${anime.id}`);
    const result: Partial<Record<AudioMode, ProviderStream[]>> = {};
    for (const mode of requestedModes(modes)) {
        const sourceSlug = match.sourceSlugs[mode];
        if (!sourceSlug) continue;
        const payload = await requestJson(
            new URL(
                `/api/show/${match.showSlug}/episode/ep-${match.number}-${sourceSlug}`,
                baseUrl
            ),
            serversSchema,
            headers
        );
        const streams = (
            await Promise.all(
                (payload.servers ?? []).map(async ({ src }) => {
                    const playerUrl = httpsUrl(src);
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
                            return {
                                url: playerUrl.toString(),
                                kind: 'iframe' as const,
                                quality: null,
                                subtitleUrl: null,
                                provider: 'KickAssAnime',
                            };
                        }

                        const manifest = encoded.replaceAll('&amp;', '&').replaceAll('&quot;', '"');
                        const url = httpsUrl(
                            manifest.startsWith('//') ? `https:${manifest}` : manifest
                        );
                        if (url && (await playableManifest(url))) {
                            return {
                                url: url.toString(),
                                kind: 'direct' as const,
                                quality: null,
                                subtitleUrl: null,
                                provider: 'KickAssAnime',
                            };
                        }
                        return {
                            url: playerUrl.toString(),
                            kind: 'iframe' as const,
                            quality: null,
                            subtitleUrl: null,
                            provider: 'KickAssAnime',
                        };
                    } catch {
                        return {
                            url: playerUrl.toString(),
                            kind: 'iframe' as const,
                            quality: null,
                            subtitleUrl: null,
                            provider: 'KickAssAnime',
                        };
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
