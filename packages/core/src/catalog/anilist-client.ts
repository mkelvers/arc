import { createHash } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db, type DatabaseTransaction } from '@arc/shared/db';
import { anilistQuerySnapshot } from '@arc/shared/db/schema';
import {
    graphql,
    GraphQLRequestError,
    type GraphQLDocument,
    type GraphQLOptions,
} from '@arc/shared/graphql';
import { coordinatedAniListRequest } from './anilist-lease';
import { requestKitsu } from './kitsu';
import { logger } from '../application/logger';
import { AniListAnimeSchema, AniListAnimeOverviewSchema } from './anilist-types';

export interface AniListRequestOptions extends GraphQLOptions {
    refreshAfterMs?: number;
    forceRefresh?: boolean;
}

type JsonValue = z.infer<ReturnType<typeof z.json>>;

function jsonRecord(value: JsonValue | undefined) {
    const parsed = z.record(z.string(), z.json()).safeParse(value);
    return parsed.success ? parsed.data : null;
}

function canonical(value: JsonValue): JsonValue {
    if (Array.isArray(value)) {
        return value.map(canonical);
    }

    const object = jsonRecord(value);
    if (!object) {
        return value;
    }

    return Object.fromEntries(
        Object.entries(object)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entry]) => [key, canonical(entry)])
    );
}

function querySnapshotKey<TVariables>(
    document: GraphQLDocument<unknown, TVariables>,
    variables: TVariables
) {
    const parsedVariables = z.json().parse(JSON.parse(JSON.stringify(variables)));
    const serializedVariables = JSON.stringify(canonical(parsedVariables)) ?? 'null';

    return createHash('sha256')
        .update(document.toString())
        .update('\0')
        .update(serializedVariables)
        .digest('hex');
}

async function refresh<TResult, TVariables>(
    tx: DatabaseTransaction,
    key: string,
    document: GraphQLDocument<TResult, TVariables>,
    variables: TVariables,
    options: AniListRequestOptions
) {
    const operation = document.toString().match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? 'anonymous';
    let data: TResult;
    try {
        data = await coordinatedAniListRequest(operation, async () => {
            const result = await graphql(
                'https://graphql.anilist.co',
                document,
                variables,
                options
            );
            if (operation === 'Anime' || operation === 'AnimeOverview') {
                const parsed = z
                    .object({
                        Media: (operation === 'Anime'
                            ? AniListAnimeSchema
                            : AniListAnimeOverviewSchema
                        ).nullable(),
                    })
                    .safeParse(result);
                const requested = z.object({ id: z.number() }).parse(variables);
                if (
                    !parsed.success ||
                    (parsed.data.Media && parsed.data.Media.id !== requested.id)
                ) {
                    throw new GraphQLRequestError({
                        message: 'AniList returned invalid media data',
                    });
                }
            }
            return result;
        });
    } catch (cause) {
        if (
            !(cause instanceof GraphQLRequestError) ||
            (cause.status != null &&
                cause.status !== 408 &&
                cause.status !== 429 &&
                !(
                    cause.status === 403 &&
                    cause.message ===
                        'The AniList API has been temporarily disabled due to severe stability issues.'
                ) &&
                cause.status < 500)
        ) {
            throw cause;
        }
        try {
            const fallback = await requestKitsu(operation, variables, options.timeoutMs);
            logger.debug('catalog fallback: operation=%s source=kitsu', operation);
            // Fallback data must not overwrite a durable AniList query snapshot.
            return fallback as TResult;
        } catch (fallbackCause) {
            logger.debug(
                'catalog fallback failed: operation=%s error=%s',
                operation,
                fallbackCause
            );
            // Keep the primary error and its Retry-After information for existing callers.
            throw cause;
        }
    }
    const fetchedAt = new Date();
    const refreshAfter = new Date(
        fetchedAt.getTime() + (options.refreshAfterMs ?? 24 * 60 * 60 * 1_000)
    );

    try {
        await tx
            .insert(anilistQuerySnapshot)
            .values({ key, data, refreshAfter, fetchedAt })
            .onConflictDoUpdate({
                target: anilistQuerySnapshot.key,
                set: {
                    data,
                    refreshAfter,
                    fetchedAt,
                },
            });
    } catch {
        // Snapshot persistence is an optimization. A successful upstream response remains usable.
    }

    return data;
}

async function refreshWithLock<TResult, TVariables>(
    key: string,
    document: GraphQLDocument<TResult, TVariables>,
    variables: TVariables,
    options: AniListRequestOptions,
    requestedAt: Date
) {
    return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'arc:anilist:' + key}))`);

        const [stored] = await tx
            .select({
                data: anilistQuerySnapshot.data,
                fetchedAt: anilistQuerySnapshot.fetchedAt,
                refreshAfter: anilistQuerySnapshot.refreshAfter,
            })
            .from(anilistQuerySnapshot)
            .where(eq(anilistQuerySnapshot.key, key))
            .limit(1);
        let storedObject: Record<string, JsonValue> | null = null;

        if (stored) {
            const parsedStored = z.json().safeParse(stored.data);
            storedObject = parsedStored.success ? jsonRecord(parsedStored.data) : null;
            if (!storedObject) {
                await tx.delete(anilistQuerySnapshot).where(eq(anilistQuerySnapshot.key, key));
            } else if (
                options.forceRefresh === true
                    ? stored.fetchedAt >= requestedAt
                    : stored.refreshAfter > requestedAt
            ) {
                return storedObject as TResult;
            }
        }

        try {
            return await refresh(tx, key, document, variables, options);
        } catch (cause) {
            if (storedObject && options.forceRefresh !== true) {
                return storedObject as TResult;
            }

            throw cause;
        }
    });
}

export async function request<TResult, TVariables>(
    document: GraphQLDocument<TResult, TVariables>,
    variables: TVariables,
    options: AniListRequestOptions = {}
) {
    const refreshAfterMs = options.refreshAfterMs ?? 24 * 60 * 60 * 1_000;
    if (!Number.isSafeInteger(refreshAfterMs) || refreshAfterMs <= 0) {
        throw new RangeError('AniList snapshot refresh interval must be a positive integer');
    }

    const key = querySnapshotKey(document, variables);
    const requestedAt = new Date();
    try {
        const [stored] = await db
            .select({
                data: anilistQuerySnapshot.data,
                fetchedAt: anilistQuerySnapshot.fetchedAt,
                refreshAfter: anilistQuerySnapshot.refreshAfter,
            })
            .from(anilistQuerySnapshot)
            .where(eq(anilistQuerySnapshot.key, key))
            .limit(1);

        if (stored) {
            const parsedStored = z.json().safeParse(stored.data);
            const object = parsedStored.success ? jsonRecord(parsedStored.data) : null;
            if (!object) {
                await db.delete(anilistQuerySnapshot).where(eq(anilistQuerySnapshot.key, key));
            } else if (
                options.forceRefresh === true
                    ? stored.fetchedAt >= requestedAt
                    : stored.refreshAfter > requestedAt
            ) {
                return object as TResult;
            }
        }
    } catch {
        // A failed snapshot read should not prevent a live AniList request.
    }

    return refreshWithLock(key, document, variables, options, requestedAt);
}
