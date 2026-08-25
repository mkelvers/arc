import { load } from 'cheerio';
import { z } from 'zod';

import type { AniListAnime } from '../anilist/types';
import { animeTitles } from '../anilist/text';
import type { AudioMode } from '@arc/shared/audio';
import { matchProviderStreamEpisode } from './match';
import { episodeNumber, httpsUrl, requestJson, requestText, requestedModes } from './anivexa-utils';
import type { PlaybackProvider, ProviderEpisode, ProviderStream } from './types';

const baseUrl = 'https://anidb.app';
const episodeListSchema = z.object({
    episodes: z
        .array(
            z.object({
                id: z.union([z.string(), z.number()]),
                number: z.union([z.string(), z.number()]),
                title: z.string().optional(),
                filler: z.boolean().optional(),
            })
        )
        .optional(),
});
const languageListSchema = z.object({
    languages: z
        .array(
            z.object({
                code: z.string().optional(),
                name: z.string().optional(),
                embed_url: z.string().optional(),
            })
        )
        .optional(),
});

interface AniDBEpisode extends ProviderEpisode {
    sourceId: string | number;
}

export function parseAniDBExternalIds(html: string) {
    const id = (host: string) =>
        Number(html.match(new RegExp(`https://${host}/(?:anime|anime/view)/(\\d+)`, 'i'))?.[1]) ||
        null;
    return {
        anilistId: id('anilist\\.co'),
        malId: id('myanimelist\\.net'),
        anidbId: id('anidb\\.net'),
    };
}

export function parseAniDBSearch(html: string) {
    const $ = load(html);
    return $('a[data-search-item], a.anime-card')
        .toArray()
        .flatMap((element) => {
            const href = $(element).attr('href') ?? '';
            const slug = href.match(/\/anime\/([^/?#]+)/)?.[1];
            return slug
                ? [{ slug, title: $(element).text().trim() || slug.replaceAll('-', ' ') }]
                : [];
        });
}

export function mapAniDBEpisodes(value: z.input<typeof episodeListSchema>) {
    const parsed = episodeListSchema.safeParse(value);
    if (!parsed.success) return [];
    return (
        parsed.data.episodes
            ?.flatMap((item) => {
                const number = episodeNumber(item.number);
                return number
                    ? [
                          {
                              id: String(item.id),
                              number,
                              title: item.title?.trim() || `Episode ${number}`,
                          },
                      ]
                    : [];
            })
            .sort((left, right) => left.number - right.number) ?? []
    );
}

function languageFor(value: z.infer<typeof languageListSchema>, mode: AudioMode) {
    const names = mode === 'sub' ? ['jpn', 'ja', 'japanese'] : ['eng', 'en', 'english'];
    return value.languages?.find(
        (item) =>
            names.includes((item.code ?? '').toLowerCase()) ||
            names.includes((item.name ?? '').toLowerCase())
    );
}

async function findSeries(anime: AniListAnime) {
    for (const query of animeTitles(anime).slice(0, 5)) {
        const html = await requestText(
            new URL(`/search/suggestions?q=${encodeURIComponent(query)}`, baseUrl),
            { Accept: 'text/html', Referer: `${baseUrl}/home` }
        ).catch(() => '');
        for (const result of parseAniDBSearch(html)) {
            const page = await requestText(new URL(`/anime/${result.slug}`, baseUrl), {
                Accept: 'text/html',
                Referer: `${baseUrl}/home`,
            }).catch(() => '');
            if (parseAniDBExternalIds(page).anilistId === anime.id)
                return { slug: result.slug, page };
        }
    }
    throw new Error(`AniDB.app has no confirmed match for AniList ${anime.id}`);
}

async function inventory(anime: AniListAnime) {
    const series = await findSeries(anime);
    const id = Number(series.slug.match(/-(\d+)$/)?.[1]);
    if (!Number.isSafeInteger(id) || id <= 0)
        throw new Error(`AniDB.app returned an invalid series id for AniList ${anime.id}`);
    const parsed = mapAniDBEpisodes(
        await requestJson(new URL(`/api/frontend/anime/${id}/episodes`, baseUrl), episodeListSchema)
    );
    if (!parsed.length) throw new Error(`AniDB.app returned no episodes for AniList ${anime.id}`);
    return { series, id, episodes: parsed };
}

async function getEpisodes(anime: AniListAnime) {
    const { episodes } = await inventory(anime);
    const first = await requestJson(
        new URL(`/api/frontend/episode/${episodes[0].id}/languages`, baseUrl),
        languageListSchema
    ).catch(() => ({ languages: [] }));
    const hasDub = Boolean(languageFor(first, 'dub')?.embed_url);
    return episodes.map((episode): AniDBEpisode => ({
        ...episode,
        audio: hasDub ? ['sub', 'dub'] : ['sub'],
        sourceId: episode.id,
    }));
}

async function getStreams(
    anime: AniListAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[]
) {
    const { episodes } = await inventory(anime);
    const match = matchProviderStreamEpisode(episodes, episode, anime.episodes);
    if (!match)
        throw new Error(`AniDB.app cannot map episode ${episode.id} for AniList ${anime.id}`);
    const result: Partial<Record<AudioMode, ProviderStream[]>> = {};
    const languages = await requestJson(
        new URL(`/api/frontend/episode/${match.id}/languages`, baseUrl),
        languageListSchema
    );
    for (const mode of requestedModes(modes)) {
        const language = languageFor(languages, mode);
        const url = language?.embed_url ? httpsUrl(language.embed_url) : null;
        if (url)
            result[mode] = [
                {
                    url: url.toString(),
                    kind: 'iframe',
                    quality: null,
                    subtitleUrl: null,
                    provider: 'AniDB.app',
                },
            ];
    }
    if (!Object.keys(result).length)
        throw new Error(`AniDB.app returned no stream for episode ${episode.id}`);
    return result;
}

export const aniDBAppProvider: PlaybackProvider = {
    name: 'AniDB.app',
    providesEpisodeInventory: false,
    getEpisodes,
    getStreams,
};
