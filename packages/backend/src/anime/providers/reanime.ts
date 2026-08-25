import { z } from 'zod';

import type { AniListAnime } from '../anilist/types';
import { animeTitles } from '../anilist/text';
import type { AudioMode } from '@arc/shared/audio';
import { matchProviderStreamEpisode } from './match';
import { episodeNumber, httpsUrl, requestJson, requestedModes } from './anivexa-utils';
import type { PlaybackProvider, ProviderEpisode, ProviderStream } from './types';

const baseUrl = 'https://reanime.to';
const headers = { Accept: 'application/json, */*' };
const searchSchema = z.object({
    results: z
        .array(
            z.object({
                anime_id: z.string(),
                title: z.unknown().optional(),
                anilist_id: z.unknown().optional(),
                subbed: z.union([z.number(), z.string()]).optional(),
                dubbed: z.union([z.number(), z.string()]).optional(),
            })
        )
        .optional(),
});
const detailSchema = z
    .object({ anilist_id: z.coerce.number().int().positive().optional() })
    .loose();
const episodesSchema = z.object({
    data: z
        .array(
            z.object({
                episode_number: z.union([z.string(), z.number()]),
                title: z.string().optional(),
            })
        )
        .optional(),
});
const linksSchema = z.object({
    episode_links: z
        .array(
            z.object({
                dataType: z.string(),
                dataLink: z.string(),
                serverName: z.string().optional(),
            })
        )
        .optional(),
});
const flixSchema = z.object({
    success: z.boolean().optional(),
    servers: z
        .array(
            z.object({
                dataType: z.string(),
                dataLink: z.string(),
                serverName: z.string().optional(),
            })
        )
        .optional(),
});

interface ReAnimeEpisode extends ProviderEpisode {
    sourceNumber: number;
    links: Partial<Record<AudioMode, string[]>>;
}

export function parseReAnimeEpisodes(value: z.input<typeof episodesSchema>) {
    const parsed = episodesSchema.safeParse(value);
    if (!parsed.success) return [];
    return (
        parsed.data.data
            ?.flatMap((item) => {
                const number = episodeNumber(item.episode_number);
                return number ? [{ number, title: item.title?.trim() || `Episode ${number}` }] : [];
            })
            .sort((left, right) => left.number - right.number) ?? []
    );
}

export function parseReAnimeLinks(value: z.input<typeof linksSchema> | z.input<typeof flixSchema>) {
    const links = [
        ...(linksSchema.safeParse(value).data?.episode_links ?? []),
        ...(flixSchema.safeParse(value).data?.servers ?? []),
    ];
    const streams = links.flatMap((link) => {
        const url = httpsUrl(link.dataLink);
        if (!url) return [];
        const mode: AudioMode = /(?:^|-)dub$|dub/i.test(link.dataType) ? 'dub' : 'sub';
        return [{ mode, url: url.toString() }];
    });
    const subUrls = new Set(
        streams.flatMap((stream) => (stream.mode === 'sub' ? [stream.url] : []))
    );
    const seen = new Set<string>();
    return streams.filter((stream) => {
        if (stream.mode === 'dub' && subUrls.has(stream.url)) {
            return false;
        }
        const key = `${stream.mode}\n${stream.url}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

async function findSeries(anime: AniListAnime) {
    for (const query of animeTitles(anime).slice(0, 5)) {
        const payload = await requestJson(
            new URL(`/api/v1/search?q=${encodeURIComponent(query)}&limit=10`, baseUrl),
            searchSchema,
            headers
        );
        const direct = payload.results?.find((item) => Number(item.anilist_id) === anime.id);
        if (direct)
            return {
                slug: direct.anime_id,
                subbed: Number(direct.subbed) || 0,
                dubbed: Number(direct.dubbed) || 0,
            };
        for (const item of payload.results ?? []) {
            const detail = await requestJson(
                new URL(`/api/v1/anime/${item.anime_id}`, baseUrl),
                detailSchema,
                headers
            ).catch(() => null);
            if (detail?.anilist_id === anime.id)
                return {
                    slug: item.anime_id,
                    subbed: Number(item.subbed) || 0,
                    dubbed: Number(item.dubbed) || 0,
                };
        }
    }
    throw new Error(`ReAnime has no confirmed match for AniList ${anime.id}`);
}

async function inventory(anime: AniListAnime) {
    const series = await findSeries(anime);
    const payload = await requestJson(
        new URL(`/api/v1/anime/${series.slug}/episodes?limit=2000`, baseUrl),
        episodesSchema,
        headers
    );
    const parsed = parseReAnimeEpisodes(payload);
    if (!parsed.length) throw new Error(`ReAnime returned no episodes for AniList ${anime.id}`);
    return { ...series, episodes: parsed };
}

async function getEpisodes(anime: AniListAnime) {
    const { episodes, subbed, dubbed } = await inventory(anime);
    return episodes.map((episode): ReAnimeEpisode => ({
        ...episode,
        id: String(episode.number),
        audio: [
            ...(episode.number <= subbed ? (['sub'] as const) : []),
            ...(episode.number <= dubbed ? (['dub'] as const) : []),
        ],
        sourceNumber: episode.number,
        links: {},
    }));
}

async function getStreams(
    anime: AniListAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[]
) {
    const { slug, episodes } = await inventory(anime);
    const match = matchProviderStreamEpisode(episodes, episode, anime.episodes);
    if (!match) throw new Error(`ReAnime cannot map episode ${episode.id} for AniList ${anime.id}`);
    const [watch, flix] = await Promise.all([
        requestJson(
            new URL(`/api/watch/${slug}/${match.number}`, baseUrl),
            linksSchema,
            headers
        ).catch(() => ({})),
        requestJson(
            new URL(`/api/flix/${anime.id}/${match.number}`, baseUrl),
            flixSchema,
            headers
        ).catch(() => ({})),
    ]);
    const streams: Partial<Record<AudioMode, ProviderStream[]>> = {};
    for (const item of parseReAnimeLinks({ ...watch, ...flix })) {
        if (!requestedModes(modes).has(item.mode)) continue;
        const stream: ProviderStream = {
            url: item.url,
            kind: 'iframe',
            quality: null,
            subtitleUrl: null,
            provider: 'ReAnime',
        };
        streams[item.mode] = [...(streams[item.mode] ?? []), stream];
    }
    if (!Object.keys(streams).length)
        throw new Error(`ReAnime returned no stream for episode ${episode.id}`);
    return streams;
}

export const reAnimeProvider: PlaybackProvider = { name: 'ReAnime', getEpisodes, getStreams };
