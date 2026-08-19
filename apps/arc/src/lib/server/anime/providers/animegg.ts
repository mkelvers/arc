import { load } from 'cheerio';

import { animeTitles } from '../anilist/text';
import type { AniListAnime } from '../anilist/types';
import { providerMediaId, saveProviderMediaId, verifyProviderMediaId } from './mapping';
import {
    coversExpectedEpisodes,
    matchProviderStreamEpisode,
    normalizedProviderTitle,
} from './match';
import type { PlaybackProvider, ProviderEpisode, ProviderStream } from './types';

const baseUrl = 'https://www.animegg.org';
const providerName = 'animegg';
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

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
        throw new Error(`AnimeGG returned ${response.status} for ${url.pathname}`);
    }

    return response.text();
}

function searchCandidates(html: string) {
    const $ = load(html);

    return $('a.mse')
        .map((_, element) => {
            const href = $(element).attr('href') ?? '';
            const slug = href.match(/^\/series\/([^/?#]+)/)?.[1];
            const titles = [
                $(element).find('h2').first().text(),
                ...$(element)
                    .find('div')
                    .toArray()
                    .flatMap((node) => {
                        const text = $(node).text().trim();
                        const alternate = text.match(/^Alt Titles\s*:\s*(.+)$/i)?.[1];
                        return alternate?.split(/\s*[;,]\s*/) ?? [];
                    }),
            ].filter((title) => title.trim());

            return slug ? { slug, titles } : null;
        })
        .get()
        .filter((candidate) => candidate !== null);
}

interface AnimeGGEpisode extends ProviderEpisode {
    path: string;
}

function seriesEpisodes(html: string) {
    const $ = load(html);
    const episodes: AnimeGGEpisode[] = [];

    $('a.anm_det_pop').each((_, element) => {
        const path = ($(element).attr('href') ?? '').replace(/#.*$/, '');
        const number = Number(
            $(element)
                .find('strong')
                .text()
                .trim()
                .match(/(\d+)\s*$/)?.[1]
        );
        if (!path.startsWith('/') || !Number.isSafeInteger(number) || number <= 0) {
            return;
        }

        const row = $(element).parent();
        const audio = [
            ...(row.find('.btn-subbed').length ? (['sub'] as const) : []),
            ...(row.find('.btn-dubbed').length ? (['dub'] as const) : []),
        ];
        if (!audio.length) {
            return;
        }

        episodes.push({
            id: String(number),
            number,
            title: row.find('.anititle').first().text().trim() || `Episode ${number}`,
            audio,
            path,
        });
    });

    return episodes
        .filter(
            (episode, index, values) =>
                values.findIndex((candidate) => candidate.number === episode.number) === index
        )
        .toSorted((left, right) => left.number - right.number);
}

async function loadSeries(slug: string) {
    return seriesEpisodes(await requestText(new URL(`/series/${slug}`, baseUrl)));
}

async function findAnimeSlug(anime: AniListAnime, refresh = false) {
    if (!refresh) {
        const stored = await providerMediaId(anime.id, providerName);
        if (stored) {
            return stored;
        }
    }

    const titleKeys = new Set(animeTitles(anime).map(normalizedProviderTitle));
    const candidates = new Map<string, string[]>();

    for (const title of animeTitles(anime).slice(0, 4)) {
        const results = searchCandidates(
            await requestText(new URL(`/search/?q=${encodeURIComponent(title)}`, baseUrl))
        );
        for (const candidate of results) {
            if (
                candidate.titles.some((candidateTitle) =>
                    titleKeys.has(normalizedProviderTitle(candidateTitle))
                )
            ) {
                candidates.set(candidate.slug, candidate.titles);
            }
        }
    }

    for (const slug of candidates.keys()) {
        const episodes = await loadSeries(slug);
        if (
            episodes.length &&
            (anime.status !== 'FINISHED' || coversExpectedEpisodes(episodes, anime.episodes))
        ) {
            await saveProviderMediaId(anime.id, providerName, slug);
            return slug;
        }
    }

    throw new Error(`AnimeGG has no exact release match for AniList ${anime.id}`);
}

async function episodes(anime: AniListAnime) {
    let slug = await findAnimeSlug(anime);

    try {
        const result = await loadSeries(slug);
        if (!result.length) {
            throw new Error('AnimeGG returned an empty episode inventory');
        }
        await verifyProviderMediaId(anime.id, providerName);
        return result;
    } catch (cause) {
        if (
            !(cause instanceof Error && /returned 404|empty episode inventory/.test(cause.message))
        ) {
            throw cause;
        }

        slug = await findAnimeSlug(anime, true);
        return loadSeries(slug);
    }
}

function streamSources(html: string) {
    const declaration = html.match(/var\s+videoSources\s*=\s*(\[[\s\S]*?\]);/)?.[1];
    if (!declaration) {
        return [];
    }

    return [...declaration.matchAll(/\{([\s\S]*?)\}/g)].flatMap(([, value]) => {
        const file = value.match(/\bfile\s*:\s*["']([^"']+)["']/)?.[1];
        const quality = value.match(/\blabel\s*:\s*["']([^"']+)["']/)?.[1] ?? null;
        if (!file) {
            return [];
        }

        try {
            const url = new URL(file, baseUrl);
            return url.protocol === 'https:' ? [{ url: url.toString(), quality }] : [];
        } catch {
            return [];
        }
    });
}

async function getStreams(
    anime: AniListAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: Parameters<PlaybackProvider['getStreams']>[2]
) {
    const available = await episodes(anime);
    const match = matchProviderStreamEpisode(available, episode, anime.episodes);
    if (!match) {
        throw new Error(`AnimeGG cannot map episode ${episode.id} for AniList ${anime.id}`);
    }

    const page = new URL(match.path, baseUrl);
    const $ = load(await requestText(page));
    const streams = await Promise.all(
        [...new Set(modes)].map(async (mode) => {
            if (mode === 'raw' || !match.audio.includes(mode)) {
                return [mode, []] as const;
            }

            const embedIds = $('a[data-toggle="tab"]')
                .toArray()
                .flatMap((element) => {
                    const version = ($(element).attr('data-version') ?? '').toLowerCase();
                    const id = $(element).attr('data-id');
                    const audio = version.startsWith('dub') ? 'dub' : 'sub';
                    return id && audio === mode ? [id] : [];
                });
            const resolved = await Promise.all(
                embedIds.map(async (id) =>
                    streamSources(
                        await requestText(new URL(`/embed/${id}`, baseUrl), page.toString())
                    ).map((source): ProviderStream => ({
                        ...source,
                        subtitleUrl: null,
                    }))
                )
            );

            return [mode, resolved.flat()] as const;
        })
    );

    return Object.fromEntries(streams);
}

export const animeggProvider: PlaybackProvider = {
    name: 'AnimeGG',
    getEpisodes: async (anime) => (await episodes(anime)).map(({ path: _, ...episode }) => episode),
    getStreams,
};
