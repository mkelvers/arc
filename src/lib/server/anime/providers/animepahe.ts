import { env } from '$env/dynamic/private';
import { load } from 'cheerio';

import type { AudioMode } from '$lib/anime/audio';
import { record } from '$lib/utils';
import { settledStreams } from './fallback';
import { providerMediaId, saveProviderMediaId, verifyProviderMediaId } from './mapping';
import { normalizedProviderTitle, providerTitles } from './match';
import type { PlaybackProvider, ProviderAnime, ProviderEpisode, ProviderStream } from './types';

const baseUrl = 'https://animepahe.pw';
const providerName = 'animepahe';
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

interface AnimePaheReference {
    releaseId: number | null;
    session: string;
}

interface AnimePaheEpisode {
    number: number;
    session: string;
}

function headers(accept: string) {
    return {
        Accept: accept,
        Referer: `${baseUrl}/`,
        'User-Agent': userAgent,
        ...(accept === 'application/json' ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
        ...(env.ANIMEPAHE_COOKIE ? { Cookie: env.ANIMEPAHE_COOKIE.trim() } : {}),
    };
}

async function requestText(url: URL, accept: string) {
    const response = await fetch(url, {
        headers: headers(accept),
        signal: AbortSignal.timeout(8_000),
    });
    const text = await response.text();
    const challenged =
        response.headers.get('cf-mitigated') === 'challenge' ||
        (response.status === 403 &&
            /cloudflare|ddos-guard/i.test(response.headers.get('server') ?? '')) ||
        /<title>\s*(?:Just a moment|DDoS-Guard)/i.test(text) ||
        /checking your browser|challenges\.cloudflare\.com/i.test(text);

    if (challenged) {
        throw new Error('AnimePahe is blocked by a managed browser challenge');
    }
    if (!response.ok) {
        throw new Error(`AnimePahe returned ${response.status} for ${url.pathname}`);
    }

    return text;
}

async function requestJson(url: URL) {
    const text = await requestText(url, 'application/json');

    try {
        return JSON.parse(text) as unknown;
    } catch (cause) {
        throw new Error('AnimePahe returned an invalid JSON response', {
            cause,
        });
    }
}

function parseReference(value: string | null): AnimePaheReference | null {
    const match = value?.match(/^(\d+):([^:]+)$/);
    if (!match) {
        return null;
    }

    const releaseId = Number(match[1]);
    return {
        releaseId: Number.isSafeInteger(releaseId) && releaseId > 0 ? releaseId : null,
        session: match[2],
    };
}

function searchItems(value: unknown) {
    const payload = record(value);
    if (!Array.isArray(payload?.data)) {
        return [];
    }

    return payload.data.flatMap((item) => {
        const result = record(item);
        const id = Number(result?.id);
        const title = result?.title;
        const session = result?.session;
        const year = Number(result?.year);

        return Number.isSafeInteger(id) &&
            id > 0 &&
            typeof title === 'string' &&
            typeof session === 'string' &&
            session
            ? [
                  {
                      id,
                      title: title.trim(),
                      session,
                      year: Number.isSafeInteger(year) ? year : null,
                  },
              ]
            : [];
    });
}

async function findAnime(anime: ProviderAnime, refresh = false) {
    if (!refresh) {
        const stored = parseReference(await providerMediaId(anime.id, providerName));
        if (stored) {
            return stored;
        }
    }

    const titles = providerTitles(anime);
    const exactTitles = new Set(titles.map(normalizedProviderTitle));
    const expectedYear = anime.startDate?.year;

    for (const title of titles) {
        const url = new URL('/api', baseUrl);
        url.searchParams.set('m', 'search');
        url.searchParams.set('q', title);
        const match = searchItems(await requestJson(url)).find(
            (item) =>
                exactTitles.has(normalizedProviderTitle(item.title)) &&
                (!expectedYear || item.year === null || item.year === expectedYear)
        );
        if (!match) {
            continue;
        }

        const reference = `${match.id}:${match.session}`;
        await saveProviderMediaId(anime.id, providerName, reference);
        return {
            releaseId: match.id,
            session: match.session,
        };
    }

    throw new Error(`AnimePahe has no exact title match for AniList ${anime.id}`);
}

async function loadEpisodes(reference: AnimePaheReference) {
    const episodes: AnimePaheEpisode[] = [];

    for (let page = 1; page <= 100; page++) {
        const url = new URL('/api', baseUrl);
        url.searchParams.set('m', 'release');
        url.searchParams.set('id', reference.session || String(reference.releaseId ?? ''));
        url.searchParams.set('sort', 'episode_asc');
        url.searchParams.set('page', String(page));
        const payload = record(await requestJson(url));
        if (!payload || !Array.isArray(payload.data)) {
            throw new Error('AnimePahe returned an invalid episode inventory');
        }

        for (const item of payload.data) {
            const episode = record(item);
            const number = Number(episode?.episode);
            const session = episode?.session;
            if (Number.isFinite(number) && number > 0 && typeof session === 'string' && session) {
                episodes.push({ number, session });
            }
        }

        const currentPage = Number(payload.current_page);
        const lastPage = Number(payload.last_page);
        if (!Number.isSafeInteger(lastPage) || currentPage >= lastPage) {
            break;
        }
    }

    return episodes
        .filter(
            (episode, index, values) =>
                values.findIndex((candidate) => candidate.number === episode.number) === index
        )
        .sort((left, right) => left.number - right.number);
}

async function providerEpisodes(anime: ProviderAnime) {
    let reference = await findAnime(anime);
    let episodes: AnimePaheEpisode[];

    try {
        episodes = await loadEpisodes(reference);
    } catch (cause) {
        if (!(cause instanceof Error && /returned 404/.test(cause.message))) {
            throw cause;
        }

        reference = await findAnime(anime, true);
        episodes = await loadEpisodes(reference);
    }

    if (!episodes.length) {
        throw new Error(`AnimePahe returned no episodes for AniList ${anime.id}`);
    }

    await verifyProviderMediaId(anime.id, providerName);
    return { reference, episodes };
}

async function getEpisodes(anime: ProviderAnime) {
    const { episodes } = await providerEpisodes(anime);

    return episodes.map((episode): ProviderEpisode => ({
        id: String(episode.number),
        number: episode.number,
        title: '',
        audio: ['sub'],
    }));
}

function unpackPacker(payload: string, radix: number, count: number, words: string[]) {
    if (
        !Number.isSafeInteger(radix) ||
        radix < 2 ||
        radix > 62 ||
        !Number.isSafeInteger(count) ||
        count < 0
    ) {
        throw new Error('AnimePahe Kwik embed used invalid packing data');
    }

    function token(value: number): string {
        if (value >= radix) {
            return `${token(Math.floor(value / radix))}${token(value % radix)}`;
        }
        return value > 35 ? String.fromCharCode(value + 29) : value.toString(36);
    }

    const replacements = new Map<string, string>();
    for (let index = count - 1; index >= 0; index--) {
        replacements.set(token(index), words[index] || token(index));
    }

    return payload.replace(/\b\w+\b/g, (word) => {
        return replacements.get(word) ?? word;
    });
}

async function resolveKwik(value: string) {
    const embed = new URL(value);
    if (
        embed.protocol !== 'https:' ||
        !(embed.hostname === 'kwik.cx' || embed.hostname.endsWith('.kwik.cx'))
    ) {
        throw new Error('AnimePahe returned an unsupported Kwik embed');
    }

    const html = await requestText(embed, 'text/html');
    const packed = html.match(
        /eval\(function\(p,a,c,k,e,d\).*?\}\('((?:\\.|[^'])*)',(\d+),(\d+),'((?:\\.|[^'])*)'\.split\('\|'\)/s
    );
    if (!packed) {
        throw new Error('AnimePahe Kwik embed was not recognized');
    }

    const unpacked = unpackPacker(
        packed[1].replaceAll("\\'", "'"),
        Number(packed[2]),
        Number(packed[3]),
        packed[4].split('|')
    );
    const stream = unpacked.match(/https:\/\/[^"'\\\s]+\.m3u8(?:\?[^"'\\\s]*)?/i)?.[0];
    if (!stream) {
        throw new Error('AnimePahe Kwik embed returned no HLS stream');
    }

    return new URL(stream).toString();
}

async function getStreams(
    anime: ProviderAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[]
) {
    const { reference, episodes } = await providerEpisodes(anime);
    const match = episodes.find((candidate) => candidate.number === episode.number);
    if (!match) {
        throw new Error(`AnimePahe has no episode ${episode.number} for AniList ${anime.id}`);
    }

    const page = new URL(`/play/${reference.session}/${match.session}`, baseUrl);
    const $ = load(await requestText(page, 'text/html'));
    const requested = new Set(modes);
    const embeds: { mode: AudioMode; url: string; quality: string | null }[] = [];

    $('[data-src]').each((_, element) => {
        const source = $(element).attr('data-src');
        const mode: AudioMode =
            $(element).attr('data-audio')?.toLowerCase() === 'eng' ? 'dub' : 'sub';
        if (!source || !requested.has(mode)) {
            return;
        }

        const resolution = Number($(element).attr('data-resolution'));
        embeds.push({
            mode,
            url: source,
            quality: Number.isFinite(resolution) && resolution > 0 ? `${resolution}p` : null,
        });
    });

    return settledStreams(
        embeds.map(async (embed) => ({
            mode: embed.mode,
            stream: {
                url: await resolveKwik(embed.url),
                quality: embed.quality,
                audioDelay: 0,
                subtitleUrl: null,
            } satisfies ProviderStream,
        })),
        `AnimePahe returned no ${modes.join('/')} stream for episode ${episode.id}`
    );
}

export const animepaheProvider: PlaybackProvider = {
    name: 'AnimePahe',
    getEpisodes,
    getStreams,
};
