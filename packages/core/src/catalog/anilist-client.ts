import { createHash } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db, type DatabaseTransaction } from '@arc/shared/db';
import { anilistQuerySnapshot } from '@arc/shared/db/schema';
import { graphql, type GraphQLDocument, type GraphQLOptions } from '@arc/shared/graphql';
import { coordinatedAniListRequest } from './anilist-lease';

const aniListEndpoint = 'https://graphql.anilist.co';

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
    const data = await coordinatedAniListRequest(operation, () =>
        graphql(aniListEndpoint, document, variables, options)
    );
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
