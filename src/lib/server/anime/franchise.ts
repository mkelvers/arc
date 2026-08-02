import { eq, inArray } from 'drizzle-orm';
import { Effect, Schedule } from 'effect';

import {
    episodeAudioAvailabilityLabel,
    type AudioMode,
} from '$lib/anime/audio';
import type { FranchiseOrder } from '$lib/anime/types';
import { FranchiseMediaDocument } from '$lib/graphql/anilist/generated/graphql';
import { db } from '$lib/server/db';
import { animeEpisode, animeFranchiseCache } from '$lib/server/db/schema';
import { graphql } from '$lib/server/graphql';
import { plainText } from './anilist/text';
import { transientRequestError } from './anilist/client';
import { withAnimeCardPosters } from './card-posters';
import { fetchOrder, type ChiakiEntry } from './franchise/chiaki';
import {
    primaryFranchiseIds,
    type FranchiseSelectionEntry,
} from './franchise/selection';

const anilistEndpoint = 'https://graphql.anilist.co';
const requests = new Map<number, Promise<FranchiseOrder>>();

async function fetchMetadata(entries: ChiakiEntry[]) {
    const result = await Effect.runPromise(
        graphql(anilistEndpoint, FranchiseMediaDocument, {
            malIds: entries.map(({ malId }) => malId),
        }).pipe(
            Effect.retry({
                times: 2,
                schedule: Schedule.exponential('750 millis'),
                while: transientRequestError,
            }),
        ),
    );

    return new Map(
        (result.Page?.media ?? [])
            .filter((media) => media?.idMal)
            .map((media) => [media!.idMal!, media!] as const),
    );
}

function synopsis(value: string | null | undefined) {
    return plainText(value)
        .replace(/\s*\(Source:[\s\S]*$/i, '')
        .replace(/\s*Note:[\s\S]*$/i, '')
        .trim();
}

async function cachedPlayback(anilistIds: number[]) {
    if (!anilistIds.length) {
        return new Map<
            number,
            {
                audioLabel: string;
                watchHref: string | null;
            }
        >();
    }

    const cached = await db
        .select({
            anilistId: animeEpisode.anilistId,
            episodeId: animeEpisode.episodeId,
            number: animeEpisode.number,
            audio: animeEpisode.audio,
        })
        .from(animeEpisode)
        .where(inArray(animeEpisode.anilistId, anilistIds));
    const grouped = new Map<
        number,
        Array<{ episodeId: string; number: number; audio: AudioMode[] }>
    >();

    for (const episode of cached) {
        grouped.set(episode.anilistId, [
            ...(grouped.get(episode.anilistId) ?? []),
            episode,
        ]);
    }

    return new Map(
        [...grouped].map(([anilistId, episodes]) => {
            const first = episodes.toSorted(
                (left, right) => left.number - right.number,
            )[0];

            return [
                anilistId,
                {
                    audioLabel: episodeAudioAvailabilityLabel(episodes),
                    watchHref: first
                        ? `/anime/${anilistId}/watch/${encodeURIComponent(first.episodeId)}`
                        : null,
                },
            ] as const;
        }),
    );
}

async function saveOrder(malId: number, data: FranchiseOrder) {
    const fetchedAt = new Date();

    try {
        await db
            .insert(animeFranchiseCache)
            .values(
                [
                    ...new Set([
                        malId,
                        ...data.entries.map((entry) => entry.malId),
                    ]),
                ].map((entryMalId) => ({
                    malId: entryMalId,
                    data,
                    fetchedAt,
                })),
            )
            .onConflictDoUpdate({
                target: animeFranchiseCache.malId,
                set: { data, fetchedAt },
            });
    } catch (cause) {
        console.error(`Franchise cache write failed for MAL ${malId}`, cause);
    }
}

async function refresh(malId: number) {
    const { types, entries } = await fetchOrder(malId);
    const typeLabels = new Map(types.map(({ id, label }) => [id, label]));
    const metadata = await fetchMetadata(entries).catch(
        (cause): Awaited<ReturnType<typeof fetchMetadata>> => {
            console.warn(
                `AniList franchise enrichment unavailable for MAL ${malId}; using Chiaki metadata`,
                cause,
            );
            return new Map();
        },
    );
    const primaryIds = primaryFranchiseIds(
        entries.flatMap((entry): FranchiseSelectionEntry[] => {
            const media = metadata.get(entry.malId);
            if (!media) {
                return [];
            }

            return [
                {
                    malId: entry.malId,
                    title:
                        media.title?.english ||
                        entry.alternativeTitle ||
                        media.title?.romaji ||
                        media.title?.native ||
                        entry.title,
                    format: media.format,
                    episodes: media.episodes,
                    duration: media.duration,
                    popularity: media.popularity,
                    secondary: entry.secondary,
                    relations: (media.relations?.edges ?? []).flatMap(
                        (relation) =>
                            relation?.relationType && relation.node?.idMal
                                ? [
                                      {
                                          type: relation.relationType,
                                          malId: relation.node.idMal,
                                      },
                                  ]
                                : [],
                    ),
                },
            ];
        }),
    );
    const playback = await cachedPlayback(
        [...metadata.values()].map(({ id }) => id),
    );
    const data: FranchiseOrder = {
        types,
        entries: entries.flatMap((entry) => {
            const media = metadata.get(entry.malId);
            const anilistId = media?.id ?? entry.anilistId;
            const type = typeLabels.get(entry.typeId);

            if (!anilistId || !type) {
                return [];
            }

            return [
                {
                    malId: entry.malId,
                    anilistId,
                    id: anilistId,
                    type,
                    title:
                        media?.title?.english ||
                        entry.alternativeTitle ||
                        media?.title?.romaji ||
                        media?.title?.native ||
                        entry.title,
                    image:
                        media?.coverImage?.extraLarge ??
                        media?.coverImage?.large ??
                        entry.image,
                    caption: playback.get(anilistId)?.audioLabel ?? '',
                    score: media?.averageScore ?? 0,
                    genres: (media?.genres ?? []).flatMap((genre) =>
                        genre ? [genre] : [],
                    ),
                    synopsis: synopsis(media?.description),
                    secondary: entry.secondary,
                    primary:
                        primaryIds.has(entry.malId) ||
                        (!media && !entry.secondary),
                    href: `/anime/${anilistId}`,
                    watchHref:
                        playback.get(anilistId)?.watchHref ??
                        `/anime/${anilistId}`,
                },
            ];
        }),
    };

    await saveOrder(malId, data);

    return data;
}

async function cachedFranchiseOrder(malId: number) {
    let stored:
        | {
              data: FranchiseOrder;
              fetchedAt: Date;
          }
        | undefined;

    try {
        [stored] = await db
            .select({
                data: animeFranchiseCache.data,
                fetchedAt: animeFranchiseCache.fetchedAt,
            })
            .from(animeFranchiseCache)
            .where(eq(animeFranchiseCache.malId, malId))
            .limit(1);
    } catch (cause) {
        console.error(`Franchise cache read failed for MAL ${malId}`, cause);
    }

    if (
        stored &&
        Date.now() - stored.fetchedAt.getTime() < 24 * 60 * 60 * 1_000
    ) {
        return stored.data;
    }

    const pending = requests.get(malId);
    if (pending) {
        return pending;
    }

    const request = refresh(malId).catch((cause) => {
        if (stored) {
            console.warn(
                `Franchise refresh failed for MAL ${malId}; using stored order`,
                cause,
            );
            return stored.data;
        }
        throw cause;
    });
    requests.set(malId, request);

    try {
        return await request;
    } finally {
        requests.delete(malId);
    }
}

async function getFranchiseOrder(malId: number): Promise<FranchiseOrder> {
    const order = await cachedFranchiseOrder(malId);

    return {
        ...order,
        entries: await withAnimeCardPosters(order.entries),
    };
}

export const franchise = {
    getFranchiseOrder,
};
