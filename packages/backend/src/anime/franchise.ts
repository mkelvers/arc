import { eq, inArray } from 'drizzle-orm';

import type { FranchiseOrder } from '@arc/shared/types';
import {
    FranchiseMediaDocument,
    type FranchiseMediaQuery,
} from '@arc/shared/anilist/generated/graphql';
import { db } from '@arc/db';
import { animeEpisode, animeFranchiseCache } from '@arc/db/schema';
import { request } from './anilist/client';
import { plainText, present } from './anilist/text';
import { enrichAnimeCards } from './card-enrichment';
import { fetchOrder, type ChiakiEntry } from './franchise/chiaki';
import { verifiedFranchiseCache, verifiedFranchiseOrder } from './franchise/cache';
import { withFranchisePlayback } from './franchise/playback';
import {
    isFranchiseEntryEligible,
    primaryFranchiseIds,
    type FranchiseSelectionEntry,
} from './franchise/selection';

const requests = new Map<number, Promise<FranchiseOrder>>();
type FranchiseMedia = NonNullable<NonNullable<FranchiseMediaQuery['Page']>['media']>[number];

async function fetchMetadata(entries: ChiakiEntry[]) {
    const malIds = [...new Set(entries.map(({ malId }) => malId))];
    const metadata = new Map<number, FranchiseMedia>();

    for (let offset = 0; offset < malIds.length; offset += 50) {
        const result = await request(
            FranchiseMediaDocument,
            { malIds: malIds.slice(offset, offset + 50) },
            { cacheForMs: 7 * 24 * 60 * 60 * 1_000 }
        );

        for (const media of present(result.Page?.media)) {
            if (media && media.idMal) {
                metadata.set(media.idMal, media);
            }
        }
    }

    return metadata;
}

async function currentPlayback(entries: FranchiseOrder['entries']) {
    const anilistIds = [...new Set(entries.map(({ anilistId }) => anilistId))];
    if (!anilistIds.length) {
        return entries;
    }

    const episodes = await db
        .select({
            anilistId: animeEpisode.anilistId,
            episodeId: animeEpisode.episodeId,
            number: animeEpisode.number,
            audio: animeEpisode.audio,
        })
        .from(animeEpisode)
        .where(inArray(animeEpisode.anilistId, anilistIds));

    return withFranchisePlayback(entries, episodes);
}

function currentPrimaryFlags(entries: FranchiseOrder['entries']) {
    const primaryIds = primaryFranchiseIds(
        entries.map((entry) => ({
            malId: entry.malId,
            title: entry.title,
            format: entry.format,
            status: entry.status,
            episodes: entry.episodes,
            duration: entry.duration,
            popularity: entry.popularity,
            secondary: entry.secondary,
            relations: entry.relations,
        }))
    );

    return entries.map((entry) => ({ ...entry, primary: primaryIds.has(entry.malId) }));
}

async function saveOrder(malId: number, data: FranchiseOrder) {
    const fetchedAt = new Date();
    const cached = verifiedFranchiseCache(data, fetchedAt);

    try {
        // Concurrent refreshes of the same franchise upsert this identical row set; insert in a
        // deterministic order so they lock the same tuples in the same order instead of deadlocking.
        await db
            .insert(animeFranchiseCache)
            .values(
                [...new Set([malId, ...data.entries.map((entry) => entry.malId)])]
                    .sort((left, right) => left - right)
                    .map((entryMalId) => ({
                        malId: entryMalId,
                        data: cached,
                        fetchedAt,
                    }))
            )
            .onConflictDoUpdate({
                target: animeFranchiseCache.malId,
                set: { data: cached, fetchedAt },
            });
    } catch (cause) {
        console.error(`Franchise cache write failed for MAL ${malId}`, cause);
    }
}

async function refresh(malId: number) {
    const { types, entries } = await fetchOrder(malId);
    const typeLabels = new Map(types.map(({ id, label }) => [id, label]));
    const metadata = await fetchMetadata(entries);
    const primaryIds = primaryFranchiseIds(
        entries.flatMap((entry): FranchiseSelectionEntry[] => {
            const media = metadata.get(entry.malId);
            if (!media || !isFranchiseEntryEligible(media)) {
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
                    status: media.status,
                    episodes: media.episodes,
                    duration: media.duration,
                    popularity: media.popularity,
                    secondary: entry.secondary,
                    relations: (media.relations?.edges ?? []).flatMap((relation) =>
                        relation?.relationType && relation.node?.idMal
                            ? [
                                  {
                                      type: relation.relationType,
                                      malId: relation.node.idMal,
                                  },
                              ]
                            : []
                    ),
                },
            ];
        })
    );
    const data: FranchiseOrder = {
        types,
        entries: entries.flatMap((entry) => {
            const media = metadata.get(entry.malId);
            const anilistId = media?.id;
            const type = typeLabels.get(entry.typeId);

            if (!anilistId || !type || (media && !isFranchiseEntryEligible(media))) {
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
                    image: media?.coverImage?.extraLarge ?? media?.coverImage?.large ?? entry.image,
                    audioLabel: '',
                    score: media?.averageScore ?? 0,
                    format: media?.format,
                    status: media?.status,
                    episodes: media?.episodes,
                    duration: media?.duration,
                    popularity: media?.popularity,
                    relations: (media?.relations?.edges ?? []).flatMap((relation) =>
                        relation?.relationType && relation.node?.idMal
                            ? [{ type: relation.relationType, malId: relation.node.idMal }]
                            : []
                    ),
                    genres: (media?.genres ?? []).flatMap((genre) => (genre ? [genre] : [])),
                    synopsis: plainText(media?.description),
                    secondary: entry.secondary,
                    primary: primaryIds.has(entry.malId) || (!media && !entry.secondary),
                    href: `/anime/${anilistId}`,
                    link: `/anime/${anilistId}`,
                },
            ];
        }),
    };

    await saveOrder(malId, data);

    return data;
}

async function cachedFranchiseOrder(malId: number) {
    let stored: { data: unknown; fetchedAt: Date } | undefined;

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

    const storedOrder = stored ? verifiedFranchiseOrder(stored.data) : null;

    if (
        stored &&
        storedOrder &&
        Date.now() - stored.fetchedAt.getTime() < 7 * 24 * 60 * 60 * 1_000
    ) {
        return storedOrder;
    }

    const pending = requests.get(malId);
    if (pending && !storedOrder) {
        return pending;
    }

    if (storedOrder) {
        if (!pending) {
            const background = refresh(malId);
            requests.set(malId, background);
            void background
                .catch((cause) => {
                    console.warn(
                        `Franchise refresh failed for MAL ${malId}; using stored order`,
                        cause
                    );
                })
                .finally(() => {
                    if (requests.get(malId) === background) {
                        requests.delete(malId);
                    }
                });
        }

        return storedOrder;
    }

    const request = refresh(malId);
    requests.set(malId, request);

    try {
        return await request;
    } finally {
        requests.delete(malId);
    }
}

export async function getFranchiseOrder(malId: number): Promise<FranchiseOrder> {
    const order = await cachedFranchiseOrder(malId);
    const entries = await currentPlayback(currentPrimaryFlags(order.entries));

    return {
        ...order,
        entries: await enrichAnimeCards(entries),
    };
}
