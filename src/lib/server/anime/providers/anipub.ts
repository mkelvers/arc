import { load } from 'cheerio';

import type { AudioMode } from '$lib/anime/audio';
import { record } from '$lib/utils';
import { fullestCaption } from './captions';
import { settledStreams } from './fallback';
import {
    providerMediaId,
    saveProviderMediaId,
    verifyProviderMediaId,
} from './mapping';
import {
    normalizedProviderTitle,
    providerTitles,
} from './match';
import type {
    PlaybackProvider,
    ProviderAnime,
    ProviderEpisode,
    ProviderStream,
} from './types';

const baseUrl = 'https://anipub.xyz';
const megaplayUrl = 'https://megaplay.buzz';
const providerName = 'anipub';
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

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
        throw new Error(
            `AniPub returned ${response.status} for ${url.pathname}`,
        );
    }

    return response.text();
}

async function requestJson(url: URL, referer = `${baseUrl}/`) {
    const text = await requestText(url, referer);

    try {
        return JSON.parse(text) as unknown;
    } catch (cause) {
        throw new Error('AniPub returned an invalid JSON response', {
            cause,
        });
    }
}

function searchResults(value: unknown) {
    if (Array.isArray(value)) {
        return value.flatMap((item) => {
            const result = record(item);
            const id = Number(result?.Id);
            const name = result?.Name;
            return Number.isSafeInteger(id) &&
                id > 0 &&
                typeof name === 'string'
                ? [{ id, name: name.trim() }]
                : [];
        });
    }

    const result = record(value);
    const id = Number(result?.Id);
    const name = result?.Name;
    return Number.isSafeInteger(id) &&
        id > 0 &&
        typeof name === 'string'
        ? [{ id, name: name.trim() }]
        : [];
}

async function info(id: number) {
    const value = record(
        await requestJson(new URL(`/api/info/${id}`, baseUrl)),
    );
    const malId = Number(value?.MALID);

    return {
        id: Number(value?._id),
        malId: Number.isSafeInteger(malId) ? malId : null,
    };
}

async function findAnimeId(anime: ProviderAnime, refresh = false) {
    if (!refresh) {
        const stored = Number(
            await providerMediaId(anime.id, providerName),
        );
        if (Number.isSafeInteger(stored) && stored > 0) {
            return stored;
        }
    }

    if (!anime.idMal) {
        throw new Error(`AniList ${anime.id} has no MAL ID`);
    }

    const titles = providerTitles(anime);
    const exactTitles = new Set(titles.map(normalizedProviderTitle));
    const visited = new Set<number>();

    for (const title of titles) {
        const candidates = searchResults(
            await requestJson(
                new URL(
                    `/api/search/${encodeURIComponent(title.trim())}`,
                    baseUrl,
                ),
            ),
        ).filter(
            (candidate) =>
                exactTitles.has(
                    normalizedProviderTitle(candidate.name),
                ) && !visited.has(candidate.id),
        );

        for (const candidate of candidates.slice(0, 8)) {
            visited.add(candidate.id);
            const identity = await info(candidate.id).catch(() => null);
            if (
                !identity ||
                identity.id !== candidate.id ||
                identity.malId !== anime.idMal
            ) {
                continue;
            }

            await saveProviderMediaId(
                anime.id,
                providerName,
                String(candidate.id),
            );
            return candidate.id;
        }
    }

    throw new Error(
        `AniPub has no exact MAL match for AniList ${anime.id}`,
    );
}

function episodeLinks(value: unknown) {
    const payload = record(value);
    const local = record(payload?.local);
    const first = local?.link;
    const rest = Array.isArray(local?.ep) ? local.ep : [];
    const links = [
        typeof first === 'string' ? first : '',
        ...rest.map((item) => {
            const episode = record(item);
            return typeof episode?.link === 'string'
                ? episode.link
                : '';
        }),
    ].map((link) => link.trim().replace(/^src=/, ''));

    if (!links.length || links.some((link) => !link)) {
        throw new Error('AniPub returned an invalid episode inventory');
    }

    return links;
}

async function loadEpisodeLinks(anime: ProviderAnime) {
    let id = await findAnimeId(anime);

    try {
        const links = episodeLinks(
            await requestJson(
                new URL(`/v1/api/details/${id}`, baseUrl),
            ),
        );
        await verifyProviderMediaId(anime.id, providerName);
        return links;
    } catch (cause) {
        if (
            !(
                cause instanceof Error &&
                /returned 404/.test(cause.message)
            )
        ) {
            throw cause;
        }

        id = await findAnimeId(anime, true);
        return episodeLinks(
            await requestJson(
                new URL(`/v1/api/details/${id}`, baseUrl),
            ),
        );
    }
}

async function getEpisodes(anime: ProviderAnime) {
    const links = await loadEpisodeLinks(anime);

    return links.map(
        (_, index): ProviderEpisode => ({
            id: String(index + 1),
            number: index + 1,
            title: '',
            // Availability is probed independently for each audio mode
            // when the watch route resolves the episode.
            audio: ['sub'],
        }),
    );
}

function embedId(link: string) {
    const url = new URL(link);
    const match = url.pathname.match(/^\/video\/(\d+)\/(?:sub|dub)$/);
    if (
        !['anipub.xyz', 'www.anipub.xyz'].includes(url.hostname) ||
        !match
    ) {
        throw new Error('AniPub returned an unsupported episode link');
    }

    return match[1];
}

async function resolveStream(id: string, mode: AudioMode) {
    if (mode === 'raw') {
        throw new Error('AniPub does not expose raw streams');
    }

    const page = new URL(`/stream/s-2/${id}/${mode}`, megaplayUrl);
    const $ = load(await requestText(page, `${baseUrl}/`));
    const sourceId = $('[data-id]')
        .map((_, element) => $(element).attr('data-id'))
        .get()
        .find((value) => /^\d+$/.test(value ?? ''));
    if (!sourceId) {
        throw new Error('AniPub MegaPlay embed returned no source ID');
    }

    const payload = record(
        await requestJson(
            new URL(`/stream/getSources?id=${sourceId}`, megaplayUrl),
            page.toString(),
        ),
    );
    const sources = record(payload?.sources);
    const file = sources?.file;
    if (typeof file !== 'string') {
        throw new Error('AniPub MegaPlay embed returned no HLS stream');
    }

    const url = new URL(file);
    if (url.protocol !== 'https:') {
        throw new Error('AniPub returned an unsupported stream URL');
    }

    const captions = Array.isArray(payload?.tracks)
        ? payload.tracks.flatMap((item) => {
              const track = record(item);
              const file = track?.file;
              const label =
                  typeof track?.label === 'string'
                      ? track.label.toLowerCase()
                      : '';
              if (
                  typeof file !== 'string' ||
                  String(track?.kind).toLowerCase() !== 'captions' ||
                  !/\b(?:eng|english)\b/.test(label)
              ) {
                  return [];
              }

              try {
                  const url = new URL(file);
                  return url.protocol === 'https:'
                      ? [
                            {
                                url: url.toString(),
                                preferred: track?.default === true,
                            },
                        ]
                      : [];
              } catch {
                  return [];
              }
          })
        : [];
    const subtitleUrl = await fullestCaption(captions, (subtitle) =>
        requestText(new URL(subtitle), `${megaplayUrl}/`),
    );

    return {
        url: url.toString(),
        quality: null,
        audioDelay: 0,
        subtitleUrl,
    } satisfies ProviderStream;
}

async function getStreams(
    anime: ProviderAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[],
) {
    if (
        !Number.isInteger(episode.number) ||
        episode.number <= 0
    ) {
        throw new Error(
            `AniPub cannot map episode ${episode.id} to an integer`,
        );
    }

    const links = await loadEpisodeLinks(anime);
    const link = links[episode.number - 1];
    if (!link) {
        throw new Error(
            `AniPub has no episode ${episode.number} for AniList ${anime.id}`,
        );
    }

    const id = embedId(link);
    return settledStreams(
        [...new Set(modes)].map(async (mode) => ({
            mode,
            stream: await resolveStream(id, mode),
        })),
        `AniPub returned no ${modes.join('/')} stream for episode ${episode.id}`,
    );
}

export const anipubProvider: PlaybackProvider = {
    name: 'AniPub',
    getEpisodes,
    getStreams,
};
