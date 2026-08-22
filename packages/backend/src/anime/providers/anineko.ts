import { load } from 'cheerio';
import { z } from 'zod';

import type { AudioMode } from '@arc/shared/audio';
import { animeTitles } from '../anilist/text';
import type { AniListAnime } from '../anilist/types';
import { providerMediaId, saveProviderMediaId, verifyProviderMediaId } from './mapping';
import {
    isSpecialEpisodeReference,
    matchProviderStreamEpisode,
    normalizedProviderTitle,
    specialCollectionMatches,
    specialReleaseQueries,
    standaloneSpecialMatches,
} from './match';
import type { PlaybackProvider, ProviderEpisode, ProviderStream, ProviderStreams } from './types';
import type { JsonValue } from '#utils';

const baseUrl = 'https://anineko.to';
const providerName = 'anineko';
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const searchResponseSchema = z.object({
    success: z.boolean(),
    results: z.array(z.object({ title: z.string(), url: z.string() })),
});
const packedLinksSchema = z.object({
    hls2: z.string().optional(),
    hls3: z.string().optional(),
    hls4: z.string().optional(),
});

async function requestText(url: URL, referer = `${baseUrl}/`) {
    const response = await fetch(url, {
        headers: {
            Accept: 'text/html,application/json',
            Referer: referer,
            'User-Agent': userAgent,
        },
        signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
        throw new Error(`AniNeko returned ${response.status} for ${url.pathname}`);
    }

    return response.text();
}

function searchResults(value: JsonValue) {
    const parsed = searchResponseSchema.safeParse(value);
    if (!parsed.success || !parsed.data.success) {
        return [];
    }

    return parsed.data.results.flatMap(({ title, url: path }) => {
        const url = new URL(path, baseUrl);
        const match = url.pathname.match(/^\/watch\/([^/?#]+)$/);
        return url.origin === baseUrl && match ? [{ title: title.trim(), slug: match[1] }] : [];
    });
}

function pageIdentity(html: string) {
    const $ = load(html);
    const title = $('.nv-info-main h1').first().text().trim();
    const alternativeTitle = $('.nv-info-alt-title').first().text().trim();
    const year = $('.nv-info-tags span')
        .map((_, element) => $(element).text().trim())
        .get()
        .map(Number)
        .find((value) => Number.isInteger(value) && value > 1900);

    return { title, alternativeTitle, year: year ?? null };
}

// AniNeko appends a disambiguator such as "(TV)" to some titles (e.g.
// "Jujutsu Kaisen (TV)"). Strip a trailing parenthetical before exact
// matching; only the very end of the title is touched, so sequels such as
// "Jujutsu Kaisen 2nd Season" still compare as distinct titles.
function matchableTitle(title: string) {
    return normalizedProviderTitle(title.replace(/\s*\((?:tv|tv series)\)$/i, ''));
}

function exactPageIdentity(identity: ReturnType<typeof pageIdentity>, anime: AniListAnime) {
    const titles = new Set(animeTitles(anime).map(normalizedProviderTitle));
    const pageTitles = new Set([identity.title, identity.alternativeTitle].map(matchableTitle));
    if (![...titles].some((title) => pageTitles.has(title))) {
        return false;
    }

    const expectedYear = anime.startDate?.year;
    return !expectedYear || identity.year === null || identity.year === expectedYear;
}

async function findSlug(anime: AniListAnime, refresh = false) {
    if (!refresh) {
        const stored = await providerMediaId(anime.id, providerName);
        if (stored && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stored)) {
            return stored;
        }
    }

    const titles = animeTitles(anime);
    const exactTitles = new Set(titles.map(normalizedProviderTitle));
    const visited = new Set<string>();

    for (const title of titles) {
        const search = new URL('/ajax/search', baseUrl);
        search.searchParams.set('q', title);
        const payload = JSON.parse(await requestText(search)) as JsonValue;
        const candidates = searchResults(payload).filter(
            (candidate) =>
                exactTitles.has(matchableTitle(candidate.title)) && !visited.has(candidate.slug)
        );

        for (const candidate of candidates.slice(0, 6)) {
            visited.add(candidate.slug);
            const page = new URL(`/watch/${candidate.slug}`, baseUrl);
            const identity = pageIdentity(await requestText(page));
            if (!exactPageIdentity(identity, anime)) {
                continue;
            }

            await saveProviderMediaId(anime.id, providerName, candidate.slug);
            return candidate.slug;
        }
    }

    throw new Error(`AniNeko has no exact title match for AniList ${anime.id}`);
}

function episodeInventory(html: string, slug: string) {
    const $ = load(html);
    const episodes = new Map<number, ProviderEpisode>();

    $('.nv-info-episode-item').each((_, element) => {
        const item = $(element);
        const link = item.find(`a.nv-info-episode-main[href^="/watch/${slug}/ep-"]`);
        const href = link.attr('href') ?? '';
        const number = Number(href.match(/\/ep-(\d+)$/)?.[1]);
        if (!Number.isSafeInteger(number) || number <= 0) {
            return;
        }

        const badges = new Set(
            item
                .find('.nv-info-episode-badges span')
                .map((_, badge) => $(badge).text().trim().toUpperCase())
                .get()
        );
        const audio: AudioMode[] = [];
        if (badges.has('SUB') || badges.has('HSUB')) {
            audio.push('sub');
        }
        if (badges.has('DUB')) {
            audio.push('dub');
        }

        episodes.set(number, {
            id: String(number),
            number,
            title: link.find('span').first().text().trim(),
            audio,
        });
    });

    return [...episodes.values()].sort((left, right) => left.number - right.number);
}

async function providerEpisodes(anime: AniListAnime) {
    let slug = await findSlug(anime);
    let html: string;

    try {
        html = await requestText(new URL(`/watch/${slug}`, baseUrl));
    } catch (cause) {
        if (!(cause instanceof Error && /returned 404/.test(cause.message))) {
            throw cause;
        }

        slug = await findSlug(anime, true);
        html = await requestText(new URL(`/watch/${slug}`, baseUrl));
    }

    if (!exactPageIdentity(pageIdentity(html), anime)) {
        slug = await findSlug(anime, true);
        html = await requestText(new URL(`/watch/${slug}`, baseUrl));
    }

    const episodes = episodeInventory(html, slug);
    if (!episodes.length) {
        throw new Error(`AniNeko returned no episodes for AniList ${anime.id}`);
    }

    await verifyProviderMediaId(anime.id, providerName);
    return { slug, episodes };
}

async function getEpisodes(anime: AniListAnime) {
    const { episodes } = await providerEpisodes(anime);
    return episodes;
}

async function specialReleaseEpisode(
    anime: AniListAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1]
) {
    const visited = new Set<string>();

    for (const query of specialReleaseQueries(anime, episode)) {
        const search = new URL('/ajax/search', baseUrl);
        search.searchParams.set('q', query);
        const candidates = searchResults(JSON.parse(await requestText(search)) as JsonValue).filter(
            (candidate) =>
                !visited.has(candidate.slug) &&
                (standaloneSpecialMatches(anime, episode, [candidate.title]) ||
                    specialCollectionMatches(anime, episode, [candidate.title]))
        );

        for (const candidate of candidates.slice(0, 6)) {
            visited.add(candidate.slug);
            const html = await requestText(new URL(`/watch/${candidate.slug}`, baseUrl));
            const identity = pageIdentity(html);
            const episodes = episodeInventory(html, candidate.slug);
            const titles = [identity.title, identity.alternativeTitle];
            if (standaloneSpecialMatches(anime, episode, titles) && episodes.length === 1) {
                return {
                    slug: candidate.slug,
                    episode: episodes[0],
                };
            }
            if (
                specialCollectionMatches(anime, episode, titles, episodes.length) &&
                episode.specialIndex
            ) {
                return {
                    slug: candidate.slug,
                    episode: episodes[episode.specialIndex - 1],
                };
            }
        }
    }

    throw new Error(`AniNeko has no matching special release for ${episode.title || episode.id}`);
}

function embedUrls(html: string, mode: AudioMode) {
    if (mode === 'raw') {
        return [];
    }

    const $ = load(html);
    const groups = mode === 'dub' ? ['dub'] : ['sub', 'hsub'];
    const urls: string[] = [];

    for (const group of groups) {
        $(`.lang-group[data-id="${group}"] [data-video]`).each((_, element) => {
            const value = $(element).attr('data-video');
            if (value && !urls.includes(value)) {
                urls.push(value);
            }
        });
        if (urls.length) {
            break;
        }
    }

    return urls;
}

function embedKind(url: URL) {
    if (url.hostname === 'otakuhg.site' || url.hostname.endsWith('.otakuhg.site')) {
        return 'otakuhg';
    }
    if (
        url.hostname === 'bibiemb.xyz' ||
        url.hostname.endsWith('.bibiemb.xyz') ||
        url.hostname === 'vivibebe.site' ||
        url.hostname.endsWith('.vivibebe.site')
    ) {
        return 'vibevibe';
    }

    return null;
}

function vibevibeStream(html: string) {
    const match = html
        .replaceAll('\\/', '/')
        .match(/const\s+src\s*=\s*["'](https:\/\/[^"'\\\s]+\/master\.m3u8(?:\?[^"'\\\s]*)?)["']/i);
    if (!match) {
        throw new Error('AniNeko embed returned no HLS stream');
    }

    return new URL(match[1]);
}

// otakuhg embeds run the StreamHG player, which ships its sources in a
// Dean Edwards packed script. Take the first live source: hls4 is served by
// otakuhg.site itself and hls2 is a signed master on rotated CDN roots; hls3
// rotates ephemeral roots and is not allowed.
function unpackPackedScript(html: string) {
    const match = html.match(
        /eval\(function\s*\(p,a,c,k,e,d\)\{.*?\}\('((?:[^'\\]|\\.)*)',\s*(\d+),\s*(\d+),\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/s
    );
    if (!match) {
        return null;
    }

    const [, payload, a, c, dictionary] = match;
    const keys = dictionary.split('|');
    const radix = Number(a);
    let unpacked = payload;
    for (let index = Number(c) - 1; index >= 0; index -= 1) {
        const word = keys[index];
        if (word) {
            unpacked = unpacked.replace(new RegExp(`\\b${index.toString(radix)}\\b`, 'g'), word);
        }
    }
    return unpacked;
}

function otakuhgStreams(html: string, embed: URL) {
    const unpacked = unpackPackedScript(html);
    if (!unpacked) {
        throw new Error('AniNeko embed returned no HLS stream');
    }

    const match = unpacked.match(/var\s+links\s*=\s*(\{[\s\S]*?\})\s*;/);
    if (!match) {
        throw new Error('AniNeko embed returned no HLS stream');
    }

    const links = packedLinksSchema.parse(JSON.parse(match[1]));
    const sources = [links.hls4, links.hls2]
        .filter((source): source is string => Boolean(source))
        .map((source) => new URL(source, embed).toString())
        .filter((source, index, values) => values.indexOf(source) === index);
    if (!sources.length) {
        throw new Error('AniNeko embed returned no HLS stream');
    }

    return sources;
}

async function resolveEmbed(value: string) {
    const embed = new URL(value);
    const kind = embedKind(embed);
    if (embed.protocol !== 'https:' || !kind) {
        throw new Error('AniNeko returned an unsupported embed host');
    }

    const html = await requestText(embed, `${baseUrl}/`);
    const streams =
        kind === 'otakuhg' ? otakuhgStreams(html, embed) : [vibevibeStream(html).toString()];
    if (streams.some((stream) => new URL(stream).protocol !== 'https:')) {
        throw new Error('AniNeko returned an unsupported stream URL');
    }

    const subtitle =
        embed.searchParams.get('sub') ??
        embed.searchParams.get('caption_1') ??
        embed.searchParams.get('c1_file');
    return [
        ...streams.map((stream): ProviderStream => ({
            url: stream,
            quality: null,
            subtitleUrl: subtitle,
        })),
        {
            url: embed.toString(),
            kind: 'iframe',
            quality: null,
            subtitleUrl: null,
        } satisfies ProviderStream,
    ];
}

async function getStreams(
    anime: AniListAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[]
) {
    let slug: string | undefined;
    let match: ProviderEpisode | undefined;
    let parentError: unknown;

    try {
        const parent = await providerEpisodes(anime);
        slug = parent.slug;
        match = matchProviderStreamEpisode(parent.episodes, episode, anime.episodes);
    } catch (cause) {
        parentError = cause;
    }

    if (!match && isSpecialEpisodeReference(episode)) {
        try {
            const special = await specialReleaseEpisode(anime, episode);
            slug = special.slug;
            match = special.episode;
        } catch (cause) {
            throw new AggregateError(
                parentError ? [parentError, cause] : [cause],
                `AniNeko could not resolve special ${episode.title || episode.id}`
            );
        }
    }

    if (!match || !slug) {
        if (parentError) {
            throw parentError;
        }
        throw new Error(`AniNeko has no episode ${episode.number} for AniList ${anime.id}`);
    }

    const html = await requestText(new URL(`/watch/${slug}/ep-${match.number}`, baseUrl));
    const streams: ProviderStreams = {};
    const errors: unknown[] = [];

    for (const mode of new Set(modes)) {
        const candidates = embedUrls(html, mode);
        const results = await Promise.allSettled(candidates.map(resolveEmbed));
        const resolved = results.flatMap((result) => {
            if (result.status === 'fulfilled') {
                return result.value;
            }

            errors.push(result.reason);
            return [];
        });
        if (resolved.length) {
            streams[mode] = resolved;
        }
    }

    if (!Object.keys(streams).length) {
        throw new AggregateError(
            errors,
            `AniNeko returned no ${modes.join('/')} stream for episode ${episode.id}`
        );
    }

    return streams;
}

export const aninekoProvider: PlaybackProvider = {
    name: 'AniNeko',
    getEpisodes,
    getStreams,
};
