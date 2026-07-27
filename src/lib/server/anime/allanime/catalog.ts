import { eq } from 'drizzle-orm';

import type { AudioMode } from '$lib/anime/audio';
import {
    AllAnimeAvailableEpisodesDocument,
    AllAnimePopularAudioDocument,
    AllAnimeSearchDocument,
    type AllAnimeAvailableEpisodesQuery,
    type AllAnimeSearchQuery,
    type VaildTranslationTypeEnumType,
} from '$lib/graphql/allanime/generated/graphql';
import { db } from '$lib/server/db';
import { animePlaybackProvider } from '$lib/server/db/schema';
import { record, request } from './client';
import type { AniListAnime, Episode } from './types';

const audioCacheLifetime = 30 * 60 * 1_000;

let audioCache: {
    labels: Map<number, AudioMode[]>;
    fetchedAt: number;
} | null = null;
let audioRequest: Promise<Map<number, AudioMode[]>> | null = null;

function audioModes(value: unknown) {
    const detail = record(value);
    if (!detail) {
        return [];
    }

    return (['sub', 'dub', 'raw'] as const).filter((mode) => {
        const episodes = detail[mode];
        return Array.isArray(episodes) && episodes.length > 0;
    });
}

export async function getPopularAudioLabels() {
    if (
        audioCache &&
        Date.now() - audioCache.fetchedAt < audioCacheLifetime
    ) {
        return audioCache.labels;
    }

    if (audioRequest) {
        return audioRequest;
    }

    audioRequest = request(AllAnimePopularAudioDocument, {}).then((data) => {
        const labels = new Map<number, AudioMode[]>();

        for (const recommendation of data.queryPopular?.recommendations ?? []) {
            const card = recommendation.anyCard;
            const anilistId = Number(card?.aniListId);
            const audio = audioModes(card?.availableEpisodesDetail);

            if (
                Number.isSafeInteger(anilistId) &&
                anilistId > 0 &&
                audio.length
            ) {
                labels.set(anilistId, audio);
            }
        }

        audioCache = { labels, fetchedAt: Date.now() };
        return labels;
    });

    try {
        return await audioRequest;
    } finally {
        audioRequest = null;
    }
}

export async function findShowId(anime: AniListAnime, refresh = false) {
    if (!anime.idMal) {
        throw new Error(`AniList ${anime.id} has no MAL ID`);
    }

    if (!refresh) {
        const [stored] = await db
            .select({ showId: animePlaybackProvider.allanimeShowId })
            .from(animePlaybackProvider)
            .where(eq(animePlaybackProvider.anilistId, anime.id))
            .limit(1);

        if (stored) {
            return stored.showId;
        }
    }

    const titles = [
        anime.title?.english,
        anime.title?.romaji,
        anime.title?.native,
        ...(anime.synonyms ?? []),
    ].filter(
        (title, index, values): title is string =>
            Boolean(title?.trim()) && values.indexOf(title) === index,
    );

    // Provider title search is only discovery. MAL identity remains the match
    // contract so similarly named seasons and movies cannot leak in.
    for (const mode of ['sub', 'dub', 'raw'] as const) {
        for (const query of titles) {
            const data = await request<
                AllAnimeSearchQuery,
                {
                    search: {
                        allowAdult: boolean;
                        allowUnknown: boolean;
                        query: string;
                    };
                    translationType: VaildTranslationTypeEnumType;
                }
            >(AllAnimeSearchDocument, {
                search: {
                    allowAdult: false,
                    allowUnknown: false,
                    query,
                },
                translationType: mode,
            });
            const match = data.shows?.edges?.find(
                (show) => Number(show.malId) === anime.idMal && show._id,
            );

            if (!match?._id) {
                continue;
            }

            const now = new Date();
            await db
                .insert(animePlaybackProvider)
                .values({
                    anilistId: anime.id,
                    allanimeShowId: match._id,
                    discoveredAt: now,
                    verifiedAt: now,
                })
                .onConflictDoUpdate({
                    target: animePlaybackProvider.anilistId,
                    set: {
                        allanimeShowId: match._id,
                        verifiedAt: now,
                    },
                });

            return match._id;
        }
    }

    throw new Error(`AllAnime has no exact MAL match for ${anime.idMal}`);
}

export async function getEpisodes(
    anime: AniListAnime,
): Promise<Episode[]> {
    let showId = await findShowId(anime);
    const load = (id: string) =>
        request<
            AllAnimeAvailableEpisodesQuery,
            { showId: string; start: number; end: number }
        >(AllAnimeAvailableEpisodesDocument, {
            showId: id,
            start: 0,
            end: 100_000,
        });
    let data = await load(showId);

    if (!data.show) {
        showId = await findShowId(anime, true);
        data = await load(showId);
    }

    if (!data.show) {
        throw new Error(`AllAnime show ${showId} was not found`);
    }

    await db
        .update(animePlaybackProvider)
        .set({ verifiedAt: new Date() })
        .where(eq(animePlaybackProvider.anilistId, anime.id));

    const detail = record(data.show.availableEpisodesDetail) ?? {};
    const strings = (key: AudioMode) => {
        const values = detail[key];

        return Array.isArray(values)
            ? values.filter(
                  (value): value is string => typeof value === 'string',
              )
            : [];
    };
    const sub = new Set(strings('sub'));
    const dub = new Set(strings('dub'));
    const raw = new Set(strings('raw'));
    const titles = new Map(
        (data.episodeInfos ?? []).flatMap((episode) => {
            const id = String(episode.episodeIdNum ?? '').trim();
            const title = (episode.notes ?? '')
                .replace(/<br\s*\/?>/gi, ' ')
                .replace(/<[^>]+>/g, '')
                .replaceAll('&amp;', '&')
                .replaceAll('&quot;', '"')
                .replaceAll('&#39;', "'")
                .replaceAll('&lt;', '<')
                .replaceAll('&gt;', '>')
                .replace(/\s+/g, ' ')
                .trim();

            return id && title ? [[id, title] as const] : [];
        }),
    );

    return [...new Set([...sub, ...dub, ...raw])]
        .flatMap((id) => {
            const number = Number(id);

            if (!Number.isFinite(number) || number < 0) {
                return [];
            }

            return [
                {
                    id,
                    number,
                    title: titles.get(id) ?? '',
                    audio: [
                        ...(sub.has(id) ? ['sub' as const] : []),
                        ...(dub.has(id) ? ['dub' as const] : []),
                        ...(raw.has(id) ? ['raw' as const] : []),
                    ],
                },
            ];
        })
        .sort((left, right) => left.number - right.number);
}
