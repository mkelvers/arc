import { eq, inArray, sql } from 'drizzle-orm';

import type { FranchiseOrder } from '@arc/shared/types';
import {
    FranchiseMediaDocument,
    type FranchiseMediaQuery,
} from '@arc/shared/anilist/generated/graphql';
import { db, type DatabaseTransaction } from '@arc/db';
import { animeEpisode, animeFranchise, animeProviderMapping, animeRelease } from '@arc/db/schema';
import { request } from './anilist/client';
import { plainText, present } from './anilist/text';
import { enrichAnimeCards } from './card-enrichment';
import { fetchOrder, type ChiakiEntry } from './franchise/chiaki';
import { FranchiseRecordSchema, verifiedFranchiseRecord } from './franchise/record';
import { withFranchisePlayback } from './franchise/playback';
import { logger } from '@arc/backend/internal/logger';
import {
    isFranchiseEntryEligible,
    primaryFranchiseIds,
    type FranchiseSelectionEntry,
} from './franchise/selection';

type FranchiseMedia = NonNullable<NonNullable<FranchiseMediaQuery['Page']>['media']>[number];

type StoredFranchiseIdentity = {
    anilistId: number;
    hasProviderMapping: boolean;
};

async function fetchMetadata(entries: ChiakiEntry[]) {
    const malIds = [...new Set(entries.map(({ malId }) => malId))];
    const metadata = new Map<number, FranchiseMedia>();

    for (let offset = 0; offset < malIds.length; offset += 50) {
        const result = await request(
            FranchiseMediaDocument,
            { malIds: malIds.slice(offset, offset + 50) },
            { refreshAfterMs: 7 * 24 * 60 * 60 * 1_000 }
        );

        for (const media of present(result.Page?.media)) {
            if (media && media.idMal) {
                metadata.set(media.idMal, media);
            }
        }
    }

    return metadata;
}

async function storedIdentities(tx: DatabaseTransaction, entries: ChiakiEntry[]) {
    const malIds = [...new Set(entries.map(({ malId }) => malId))];
    const identities = new Map<number, StoredFranchiseIdentity[]>();
    if (!malIds.length) {
        return identities;
    }

    const rows = await tx
        .select({
            malId: animeRelease.malId,
            anilistId: animeRelease.anilistId,
            provider: animeProviderMapping.provider,
        })
        .from(animeRelease)
        .leftJoin(animeProviderMapping, eq(animeProviderMapping.anilistId, animeRelease.anilistId))
        .where(inArray(animeRelease.malId, malIds));

    for (const row of rows) {
        if (row.malId === null) {
            continue;
        }

        const candidates = identities.get(row.malId) ?? [];
        let candidate = candidates.find(({ anilistId }) => anilistId === row.anilistId);
        if (!candidate) {
            candidate = { anilistId: row.anilistId, hasProviderMapping: Boolean(row.provider) };
            candidates.push(candidate);
        } else if (row.provider) {
            candidate.hasProviderMapping = true;
        }
        identities.set(row.malId, candidates);
    }

    return identities;
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

async function saveOrder(tx: DatabaseTransaction, malId: number, data: FranchiseOrder) {
    const fetchedAt = new Date();
    const storedRecord = verifiedFranchiseRecord(data, fetchedAt);

    try {
        // Concurrent refreshes of the same franchise upsert this identical row set; insert in a
        // deterministic order so they lock the same tuples in the same order instead of deadlocking.
        await tx
            .insert(animeFranchise)
            .values(
                [...new Set([malId, ...data.entries.map((entry) => entry.malId)])]
                    .sort((left, right) => left - right)
                    .map((entryMalId) => ({
                        malId: entryMalId,
                        data: storedRecord,
                        fetchedAt,
                    }))
            )
            .onConflictDoUpdate({
                target: animeFranchise.malId,
                set: { data: storedRecord, fetchedAt },
            });
    } catch (cause) {
        logger.debug(`Franchise record write failed for MAL ${malId}`, cause);
    }
}

async function refresh(tx: DatabaseTransaction, malId: number) {
    const { types, entries } = await fetchOrder(malId);
    const typeLabels = new Map(types.map(({ id, label }) => [id, label]));
    const [metadata, identities] = await Promise.all([
        fetchMetadata(entries),
        storedIdentities(tx, entries),
    ]);
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
            const candidates = identities.get(entry.malId) ?? [];
            const storedIdentity =
                candidates.find(({ anilistId }) => anilistId === media?.id) ??
                candidates.find(({ hasProviderMapping }) => hasProviderMapping) ??
                candidates[0];
            const anilistId = storedIdentity?.anilistId ?? media?.id;
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
                    format: media?.format ?? null,
                    status: media?.status ?? null,
                    episodes: media?.episodes ?? null,
                    duration: media?.duration ?? null,
                    popularity: media?.popularity ?? null,
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

    await saveOrder(tx, malId, data);

    return data;
}

async function storedFranchiseOrder(malId: number) {
    let stored: { data: unknown } | undefined;

    try {
        [stored] = await db
            .select({
                data: animeFranchise.data,
            })
            .from(animeFranchise)
            .where(eq(animeFranchise.malId, malId))
            .limit(1);
    } catch (cause) {
        logger.debug(`Franchise record read failed for MAL ${malId}`, cause);
    }

    const parsedStored = stored ? FranchiseRecordSchema.safeParse(stored.data) : null;
    return parsedStored?.success ? parsedStored.data.order : null;
}

export async function refreshFranchiseOrder(malId: number, options: { force?: boolean } = {}) {
    return db.transaction(async (tx) => {
        await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${'arc:franchise:' + String(malId)}))`
        );

        if (!options.force) {
            const [stored] = await tx
                .select({ data: animeFranchise.data })
                .from(animeFranchise)
                .where(eq(animeFranchise.malId, malId))
                .limit(1);
            const parsed = stored ? FranchiseRecordSchema.safeParse(stored.data) : null;
            if (parsed?.success) {
                return parsed.data.order;
            }
        }

        return refresh(tx, malId);
    });
}

export async function getFranchiseOrder(malId: number): Promise<FranchiseOrder | null> {
    let order = await storedFranchiseOrder(malId);
    if (!order || !order.entries.some((entry) => entry.malId === malId)) {
        order = await refreshFranchiseOrder(malId);
    }

    const entries = await currentPlayback(currentPrimaryFlags(order.entries));

    return {
        ...order,
        entries: await enrichAnimeCards(entries),
    };
}
