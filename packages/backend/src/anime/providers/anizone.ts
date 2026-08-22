import { load } from 'cheerio';
import { z } from 'zod';

import type { AudioMode } from '@arc/shared/audio';
import { animeTitles } from '../anilist/text';
import { providerEpisodeCount } from '../episodes/policy';
import { normalizeTitle, seriesTitle } from '../tmdb/title';
import type { AniListAnime } from '../anilist/types';
import { providerMediaId, saveProviderMediaId, verifyProviderMediaId } from './mapping';
import { normalizedProviderTitle } from './match';
import type { PlaybackProvider, ProviderEpisode } from './types';

const baseUrl = 'https://anizone.to';
const providerName = 'anizone';
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const argumentSchema = z.json();
const candidateSchema = z.object({
    slug: z.string(),
    title_list: z.record(z.string(), z.string()),
    start_year: z.union([z.number(), z.string()]).optional(),
    episode_count: z.union([z.number(), z.string()]).optional(),
});
const playerSchema = z.object({
    src: z.string(),
    subtitles: z.array(
        z.object({ language: z.string(), forced: z.string(), format: z.string(), file: z.string() })
    ),
});

async function requestText(url: URL) {
    const response = await fetch(url, {
        headers: {
            Accept: 'application/vnd.apple.mpegurl,text/html,application/xhtml+xml',
            Referer: `${baseUrl}/`,
            'User-Agent': userAgent,
        },
        signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
        throw new Error(`AniZone returned ${response.status} for ${url.pathname}`);
    }

    return response.text();
}

function parsedArgument(value: string) {
    const escapedUnicode = '\u0001U\u0001';
    const decoded = value
        .replace(/\\\\u([0-9a-f]{4})/gi, `${escapedUnicode}$1`)
        .replace(/\\u([0-9a-f]{4})/gi, (_, code: string) =>
            String.fromCharCode(Number.parseInt(code, 16))
        )
        .replace(new RegExp(`${escapedUnicode}([0-9a-f]{4})`, 'gi'), '\\u$1');

    try {
        const parsed = argumentSchema.safeParse(JSON.parse(decoded));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function jsonArgument(html: string, name: string) {
    const match = html.match(new RegExp(`${name}:\\s*JSON\\.parse\\('((?:[^'\\\\]|\\\\.)*)'\\)`));
    return match ? parsedArgument(match[1]) : null;
}

function candidates(html: string) {
    const items = jsonArgument(html, 'items');
    if (!Array.isArray(items)) {
        return [];
    }

    return items.flatMap((value) => {
        const parsed = candidateSchema.safeParse(value);
        if (!parsed.success || !/^[a-z0-9-]+$/.test(parsed.data.slug)) {
            return [];
        }

        return [
            {
                slug: parsed.data.slug,
                titles: Object.values(parsed.data.title_list).filter(Boolean),
                year: Number.isSafeInteger(Number(parsed.data.start_year))
                    ? Number(parsed.data.start_year)
                    : null,
                episodes: Number.isSafeInteger(Number(parsed.data.episode_count))
                    ? Number(parsed.data.episode_count)
                    : null,
            },
        ];
    });
}

function episodeInventory(html: string, slug: string) {
    const $ = load(html);
    const episodes: ProviderEpisode[] = [];

    $(`a[href^="${baseUrl}/anime/${slug}/"], a[href^="/anime/${slug}/"]`).each((_, element) => {
        const href = $(element).attr('href') ?? '';
        const number = Number(href.match(/\/(\d+)\/?$/)?.[1]);
        if (!Number.isSafeInteger(number) || number <= 0) {
            return;
        }

        const data = $(element).closest('[x-data*="epsTitles"]').attr('x-data') ?? '';
        const titles = jsonArgument(data, 'epsTitles');
        const titleData = z.record(z.string(), z.string()).safeParse(titles);
        const title = titleData.success ? Object.values(titleData.data).find(Boolean) : null;
        episodes.push({
            id: String(number),
            number,
            title: title ?? `Episode ${number}`,
            audio: ['sub'],
        });
    });

    return episodes
        .filter(
            (episode, index, values) =>
                values.findIndex((candidate) => candidate.number === episode.number) === index
        )
        .toSorted((left, right) => left.number - right.number);
}

function titleReleaseSequence(title: string) {
    const normalized = normalizeTitle(title);
    const value =
        normalized.match(/\b(?:season|staffel|saison|temporada)\s+0*(\d+)\b/)?.[1] ??
        normalized.match(/\b0*(\d+)(?:st|nd|rd|th)\s+season\b/)?.[1] ??
        normalized.match(/(?:^|\s)0*(\d+)\s*期$/u)?.[1];
    const sequence = Number(value);

    return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : null;
}

async function findSlug(anime: AniListAnime, refresh = false) {
    if (!refresh) {
        const stored = await providerMediaId(anime.id, providerName);
        if (stored) {
            return stored;
        }
    }

    const titles = animeTitles(anime);
    const titleKeys = new Set(titles.map(normalizedProviderTitle));
    const seriesTitles = new Set(titles.map(seriesTitle));
    const expectedSequence = titles.map(titleReleaseSequence).find((value) => value !== null);
    const matches = new Map<string, ReturnType<typeof candidates>[number]>();
    for (const title of animeTitles(anime).slice(0, 4)) {
        for (const candidate of candidates(
            await requestText(new URL(`/anime?search=${encodeURIComponent(title)}`, baseUrl))
        )) {
            const exactTitle = candidate.titles.some((value) =>
                titleKeys.has(normalizedProviderTitle(value))
            );
            const exactYear = !anime.startDate?.year || candidate.year === anime.startDate.year;
            const sameQualifiedRelease =
                exactYear &&
                expectedSequence != null &&
                candidate.titles.some((value) => seriesTitles.has(seriesTitle(value))) &&
                candidate.titles.some((value) => titleReleaseSequence(value) === expectedSequence);
            const complete =
                anime.status !== 'FINISHED' ||
                !providerEpisodeCount(anime) ||
                candidate.episodes === providerEpisodeCount(anime);
            if ((exactTitle || sameQualifiedRelease) && exactYear && complete) {
                matches.set(candidate.slug, candidate);
            }
        }
    }

    const [match] = matches.values();
    if (!match || matches.size !== 1) {
        throw new Error(`AniZone has no unique exact release match for AniList ${anime.id}`);
    }

    await saveProviderMediaId(anime.id, providerName, match.slug);
    return match.slug;
}

async function episodes(anime: AniListAnime) {
    let slug = await findSlug(anime);
    try {
        const result = episodeInventory(
            await requestText(new URL(`/anime/${slug}`, baseUrl)),
            slug
        );
        if (!result.length) {
            throw new Error('AniZone returned an empty episode inventory');
        }
        await verifyProviderMediaId(anime.id, providerName);
        return { slug, episodes: result };
    } catch (cause) {
        if (
            !(cause instanceof Error && /returned 404|empty episode inventory/.test(cause.message))
        ) {
            throw cause;
        }

        slug = await findSlug(anime, true);
        return {
            slug,
            episodes: episodeInventory(await requestText(new URL(`/anime/${slug}`, baseUrl)), slug),
        };
    }
}

function player(html: string) {
    const match = html.match(/vidstackPlayer\(JSON\.parse\('((?:[^'\\]|\\.)*)'\)\)/);
    const value = match ? parsedArgument(match[1]) : null;
    const parsed = playerSchema.safeParse(value);
    if (!parsed.success) {
        return null;
    }
    const data = parsed.data;
    const src = data.src;
    const english = data.subtitles.find(
        (track) => track.language === 'en' && track.forced !== 'yes' && track.format === 'ass'
    );

    try {
        const url = new URL(src);
        const subtitleUrl = english ? new URL(english.file) : null;
        const videoHost =
            url.hostname === 'vid-cdn.xyz' ||
            url.hostname.endsWith('.vid-cdn.xyz') ||
            url.hostname === 'xin-cdn.xyz' ||
            url.hostname.endsWith('.xin-cdn.xyz');
        const subtitleHost =
            !subtitleUrl ||
            subtitleUrl.hostname === 'vid-cdn.xyz' ||
            subtitleUrl.hostname.endsWith('.vid-cdn.xyz') ||
            subtitleUrl.hostname === 'xin-cdn.xyz' ||
            subtitleUrl.hostname.endsWith('.xin-cdn.xyz');
        return url.protocol === 'https:' &&
            videoHost &&
            (!subtitleUrl || subtitleUrl.protocol === 'https:') &&
            subtitleHost
            ? { url: url.toString(), subtitleUrl: subtitleUrl?.toString() ?? null }
            : null;
    } catch {
        return null;
    }
}

function hlsAudioModes(playlist: string) {
    const modes = new Set<AudioMode>();

    for (const line of playlist.split(/\r?\n/)) {
        if (!line.startsWith('#EXT-X-MEDIA:') || !/\bTYPE=AUDIO\b/i.test(line)) {
            continue;
        }

        const language = line
            .match(/\bLANGUAGE=(?:"([^"]+)"|([^,]+))/i)
            ?.slice(1)
            .find(Boolean);
        const name = line
            .match(/\bNAME=(?:"([^"]+)"|([^,]+))/i)
            ?.slice(1)
            .find(Boolean);
        if (/^ja(?:-|$)/i.test(language ?? '') || /japanese/i.test(name ?? '')) {
            modes.add('sub');
        }
        if (/^en(?:-|$)/i.test(language ?? '') || /english/i.test(name ?? '')) {
            modes.add('dub');
        }
    }

    return modes;
}

export const anizoneProvider: PlaybackProvider = {
    name: 'AniZone',
    getEpisodes: async (anime) => (await episodes(anime)).episodes,
    getStreams: async (anime, episode, modes) => {
        if (
            !modes.includes('sub') ||
            !Number.isSafeInteger(episode.number) ||
            episode.number <= 0
        ) {
            return {};
        }

        const inventory = await episodes(anime);
        if (!inventory.episodes.some(({ number }) => number === episode.number)) {
            throw new Error(`AniZone has no episode ${episode.number} for AniList ${anime.id}`);
        }

        const stream = player(
            await requestText(new URL(`/anime/${inventory.slug}/${episode.number}`, baseUrl))
        );
        if (!stream) {
            throw new Error(`AniZone returned no stream for AniList ${anime.id}`);
        }

        const audio = hlsAudioModes(await requestText(new URL(stream.url)));
        if (!audio.size) {
            audio.add('sub');
        }

        return Object.fromEntries(
            modes.flatMap((mode) =>
                audio.has(mode)
                    ? [
                          [
                              mode,
                              [
                                  {
                                      ...stream,
                                      subtitleUrl: mode === 'sub' ? stream.subtitleUrl : null,
                                      quality: null,
                                  },
                              ],
                          ],
                      ]
                    : []
            )
        );
    },
};
