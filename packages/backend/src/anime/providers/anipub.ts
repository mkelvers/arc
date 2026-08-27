import { load } from 'cheerio';
import { z } from 'zod';

import type { AudioMode } from '@arc/shared/audio';
import type { JsonValue } from '#utils';
import { animeTitles } from '../anilist/text';
import { fullestCaption } from './captions';
import { providerMediaId, saveProviderMediaId, verifyProviderMediaId } from './mapping';
import { normalizedProviderTitle } from './match';
import type { AniListAnime } from '../anilist/types';
import type { PlaybackProvider, ProviderEpisode, ProviderStream } from './types';

const baseUrl = 'https://anipub.xyz';
const megaplayUrl = 'https://megaplay.buzz';
const providerName = 'anipub';
const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const searchResultSchema = z.object({ Id: z.union([z.number(), z.string()]), Name: z.string() });
const searchPayloadSchema = z.union([searchResultSchema, z.array(searchResultSchema)]);
const infoSchema = z.object({
    _id: z.union([z.number(), z.string()]),
    MALID: z.union([z.number(), z.string()]).optional(),
});
const episodeSchema = z.object({ link: z.string() });
const episodePayloadSchema = z.object({
    local: z.object({ link: z.string().optional(), ep: z.array(episodeSchema).optional() }),
});
const sourcePayloadSchema = z.object({
    sources: z.object({ file: z.string() }),
    tracks: z
        .array(
            z.object({
                file: z.string(),
                kind: z.string(),
                label: z.string(),
                default: z.boolean().optional(),
            })
        )
        .optional(),
});
const jsonValueSchema = z.json();
type AniPubSourcePayload = z.infer<typeof sourcePayloadSchema>;

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
        throw new Error(`AniPub returned ${response.status} for ${url.pathname}`);
    }

    return response.text();
}

async function requestJson(url: URL, referer = `${baseUrl}/`) {
    const text = await requestText(url, referer);

    try {
        const parsed = jsonValueSchema.safeParse(JSON.parse(text));
        if (!parsed.success) {
            throw new Error('AniPub returned an invalid JSON response');
        }
        return parsed.data;
    } catch (cause) {
        throw new Error('AniPub returned an invalid JSON response', {
            cause,
        });
    }
}

function searchResults(value: JsonValue) {
    const parsed = searchPayloadSchema.safeParse(value);
    if (!parsed.success) {
        return [];
    }
    return (Array.isArray(parsed.data) ? parsed.data : [parsed.data]).flatMap((result) => {
        const id = Number(result.Id);
        return Number.isSafeInteger(id) && id > 0 ? [{ id, name: result.Name.trim() }] : [];
    });
}

async function info(id: number) {
    const value = infoSchema.safeParse(await requestJson(new URL(`/api/info/${id}`, baseUrl)));
    if (!value.success) {
        return { id: Number.NaN, malId: null };
    }
    const malId = Number(value.data.MALID);

    return {
        id: Number(value.data._id),
        malId: Number.isSafeInteger(malId) ? malId : null,
    };
}

async function findAnimeId(anime: AniListAnime, refresh = false) {
    if (!refresh) {
        const stored = Number(await providerMediaId(anime.id, providerName));
        if (Number.isSafeInteger(stored) && stored > 0) {
            return stored;
        }
    }

    if (!anime.idMal) {
        throw new Error(`AniList ${anime.id} has no MAL ID`);
    }

    const titles = animeTitles(anime);
    const exactTitles = new Set(titles.map(normalizedProviderTitle));
    const visited = new Set<number>();

    for (const title of titles) {
        const candidates = searchResults(
            await requestJson(new URL(`/api/search/${encodeURIComponent(title.trim())}`, baseUrl))
        ).filter(
            (candidate) =>
                exactTitles.has(normalizedProviderTitle(candidate.name)) &&
                !visited.has(candidate.id)
        );

        for (const candidate of candidates.slice(0, 8)) {
            visited.add(candidate.id);
            const identity = await info(candidate.id).catch(() => null);
            if (!identity || identity.id !== candidate.id || identity.malId !== anime.idMal) {
                continue;
            }

            await saveProviderMediaId(anime.id, providerName, String(candidate.id));
            return candidate.id;
        }
    }

    throw new Error(`AniPub has no exact MAL match for AniList ${anime.id}`);
}

function episodeLinks(value: JsonValue) {
    const parsed = episodePayloadSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error('AniPub returned an invalid episode inventory');
    }
    const first = parsed.data.local.link;
    const rest = parsed.data.local.ep ?? [];
    const links = [first ?? '', ...rest.map((item) => item.link)].map((link) =>
        link.trim().replace(/^src=/, '')
    );

    if (!links.length || links.some((link) => !link)) {
        throw new Error('AniPub returned an invalid episode inventory');
    }

    return links;
}

async function loadEpisodeLinks(anime: AniListAnime) {
    let id = await findAnimeId(anime);

    try {
        const links = episodeLinks(await requestJson(new URL(`/v1/api/details/${id}`, baseUrl)));
        await verifyProviderMediaId(anime.id, providerName);
        return links;
    } catch (cause) {
        if (!(cause instanceof Error && /returned 404/.test(cause.message))) {
            throw cause;
        }

        id = await findAnimeId(anime, true);
        return episodeLinks(await requestJson(new URL(`/v1/api/details/${id}`, baseUrl)));
    }
}

async function getEpisodes(anime: AniListAnime) {
    const links = await loadEpisodeLinks(anime);

    return links.map((_, index): ProviderEpisode => ({
        id: String(index + 1),
        number: index + 1,
        title: '',
        // Availability is probed independently for each audio mode
        // when the watch route resolves the episode.
        audio: ['sub'],
    }));
}

function embedId(link: string) {
    const url = new URL(link);
    const match = url.pathname.match(/^\/video\/(\d+)\/(?:sub|dub)$/);
    if (!['anipub.xyz', 'www.anipub.xyz'].includes(url.hostname) || !match) {
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
    const sourceIds = $('[data-id]')
        .map((_, element) => $(element).attr('data-id'))
        .get()
        .filter((value): value is string => /^\d+$/.test(value ?? ''))
        .filter((value, index, values) => values.indexOf(value) === index);
    if (!sourceIds.length) {
        throw new Error('AniPub MegaPlay embed returned no source ID');
    }

    const streams: ProviderStream[] = [];
    const errors: unknown[] = [];
    for (const sourceId of sourceIds) {
        try {
            const parsed = sourcePayloadSchema.safeParse(
                await requestJson(
                    new URL(`/stream/getSources?id=${sourceId}`, megaplayUrl),
                    page.toString()
                )
            );
            if (!parsed.success) {
                throw new Error('AniPub MegaPlay embed returned no HLS stream');
            }
            const payload: AniPubSourcePayload = parsed.data;
            const file = payload.sources.file;

            const url = new URL(file);
            if (url.protocol !== 'https:') {
                throw new Error('AniPub returned an unsupported stream URL');
            }
            await requestText(url, `${megaplayUrl}/`);

            const captions = payload.tracks
                ? payload.tracks.flatMap((track) => {
                      const file = track.file;
                      const label = track.label.toLowerCase();
                      if (
                          track.kind.toLowerCase() !== 'captions' ||
                          !/\b(?:eng|english)\b/.test(label)
                      ) {
                          return [];
                      }

                      try {
                          const url = new URL(file);
                          return url.protocol === 'https:'
                              ? [{ url: url.toString(), preferred: track.default === true }]
                              : [];
                      } catch {
                          return [];
                      }
                  })
                : [];
            streams.push({
                url: url.toString(),
                quality: null,
                subtitleUrl: await fullestCaption(captions, (subtitle) =>
                    requestText(new URL(subtitle), `${megaplayUrl}/`)
                ),
            });
        } catch (cause) {
            errors.push(cause);
        }
    }

    if (!streams.length) {
        throw new AggregateError(errors, 'AniPub MegaPlay returned no playable HLS source');
    }

    streams.push({
        url: page.toString(),
        kind: 'iframe',
        quality: null,
        subtitleUrl: null,
    });
    return streams;
}

async function getStreams(
    anime: AniListAnime,
    episode: Parameters<PlaybackProvider['getStreams']>[1],
    modes: AudioMode[]
) {
    if (!Number.isInteger(episode.number) || episode.number <= 0) {
        throw new Error(`AniPub cannot map episode ${episode.id} to an integer`);
    }

    const links = await loadEpisodeLinks(anime);
    const link = links[episode.number - 1];
    if (!link) {
        throw new Error(`AniPub has no episode ${episode.number} for AniList ${anime.id}`);
    }

    const id = embedId(link);
    const results = await Promise.allSettled(
        [...new Set(modes)].map(async (mode) => ({
            mode,
            streams: await resolveStream(id, mode),
        }))
    );
    const streams = Object.fromEntries(
        results.flatMap((result) =>
            result.status === 'fulfilled' ? [[result.value.mode, result.value.streams]] : []
        )
    );
    if (!Object.keys(streams).length) {
        throw new AggregateError(
            results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
            `AniPub returned no ${modes.join('/')} stream for episode ${episode.id}`
        );
    }

    return streams;
}

export const anipubProvider: PlaybackProvider = {
    name: 'AniPub',
    getEpisodes,
    getStreams,
};
