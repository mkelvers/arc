import { load } from 'cheerio';
import { z } from 'zod';

import type { AniListAnime } from '../anilist/types';
import { animeTitles } from '../anilist/text';
import type { AudioMode } from '@arc/shared/audio';
import { matchProviderStreamEpisode } from './match';
import { episodeNumber, httpsUrl, requestJson, requestText, requestedModes } from './anivexa-utils';
import type { PlaybackProvider, ProviderEpisode, ProviderStream } from './types';

const baseUrl = 'https://animenosub.to';
const searchSchema = z.object({
    anime: z
        .array(
            z.object({
                all: z
                    .array(z.object({ post_link: z.string(), post_title: z.string().optional() }))
                    .optional(),
            })
        )
        .optional(),
});

interface AnimeNoSubEpisode extends ProviderEpisode {
    url: string;
    hasDub: boolean;
}

export function parseAnimeNoSubEpisodes(html: string) {
    const $ = load(html);
    const seen = new Set<number>();
    return $('li[data-index]')
        .toArray()
        .flatMap((element) => {
            const label = $(element).find('.epl-num').text().trim();
            const number = /^movie$/i.test(label) ? 1 : episodeNumber(parseFloat(label));
            const href = $(element).find('a').attr('href');
            if (!number || !href || seen.has(number)) return [];
            seen.add(number);
            const url = httpsUrl(href);
            return url
                ? [
                      {
                          number,
                          title: /^movie$/i.test(label) ? 'Movie' : `Episode ${number}`,
                          url: url.toString(),
                          hasDub: /(?:^|-)dub(?:$|[-/])/i.test(href),
                      },
                  ]
                : [];
        })
        .sort((left, right) => left.number - right.number);
}

export function parseAnimeNoSubEmbeds(html: string) {
    const $ = load(html);
    return $('option[value]')
        .toArray()
        .flatMap((element) => {
            const server = $(element).text().trim();
            if (!server || /select video server/i.test(server)) return [];
            try {
                const decoded = atob($(element).attr('value') ?? '');
                const raw = decoded.match(/src=["']([^"']+)["']/i)?.[1];
                const url = raw ? httpsUrl(raw.startsWith('//') ? `https:${raw}` : raw) : null;
                return url ? [{ url: url.toString(), server }] : [];
            } catch {
                return [];
            }
        });
}

async function findSeries(anime: AniListAnime) {
    for (const query of animeTitles(anime).slice(0, 5)) {
        const payload = await requestJson(
            new URL('/wp-admin/admin-ajax.php', baseUrl),
            searchSchema,
            {
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
            },
            {
                method: 'POST',
                body: `action=ts_ac_do_search&ts_ac_query=${encodeURIComponent(query)}`,
            }
        ).catch(() => null);
        const items = payload?.anime?.[0]?.all ?? [];
        const match = items.find((item) =>
            animeTitles(anime).some(
                (title) =>
                    item.post_title &&
                    item.post_title.toLocaleLowerCase('en').includes(title.toLocaleLowerCase('en'))
            )
        );
        if (match) {
            const slug = match.post_link.match(/\/anime\/([^/]+)\/?$/)?.[1];
            if (slug) return slug;
        }
    }
    throw new Error(`AnimeNoSub has no confident match for AniList ${anime.id}`);
}

async function inventory(anime: AniListAnime) {
    const slug = await findSeries(anime);
    const episodes = parseAnimeNoSubEpisodes(
        await requestText(new URL(`/anime/${slug}/`, baseUrl), { Accept: 'text/html' })
    );
    if (!episodes.length)
        throw new Error(`AnimeNoSub returned no episodes for AniList ${anime.id}`);
    return episodes;
}

async function getEpisodes(anime: AniListAnime) {
    const episodes = await inventory(anime);
    return episodes.map((episode): AnimeNoSubEpisode => ({
        ...episode,
        id: String(episode.number),
        audio: episode.hasDub ? ['dub'] : ['sub'],
    }));
}

async function getStreams(
    anime: AniListAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[]
) {
    const episodes = await inventory(anime);
    const match = matchProviderStreamEpisode(episodes, episode, anime.episodes);
    if (!match)
        throw new Error(`AnimeNoSub cannot map episode ${episode.id} for AniList ${anime.id}`);
    const source = episodes.find((item) => item.number === match.number);
    if (!source || !requestedModes(modes).has(source.hasDub ? 'dub' : 'sub')) return {};
    const embeds = parseAnimeNoSubEmbeds(
        await requestText(new URL(source.url), { Accept: 'text/html', Referer: `${baseUrl}/` })
    );
    const mode: AudioMode = source.hasDub ? 'dub' : 'sub';
    const streams: ProviderStream[] = embeds.map((embed) => ({
        url: embed.url,
        kind: 'iframe',
        quality: null,
        subtitleUrl: null,
        provider: `AnimeNoSub (${embed.server})`,
    }));
    if (!streams.length) throw new Error(`AnimeNoSub returned no stream for episode ${episode.id}`);
    return { [mode]: streams };
}

export const animeNoSubProvider: PlaybackProvider = { name: 'AnimeNoSub', getEpisodes, getStreams };
