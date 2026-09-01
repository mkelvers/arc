import { createHash } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db, type DatabaseTransaction } from '@arc/db';
import { anilistQuerySnapshot } from '@arc/db/schema';
import { logger } from '@arc/backend/internal/logger';
import { graphql } from '../../graphql';
import { record, type JsonValue } from '../../utils';
import { coordinatedAniListRequest } from './durable-request-policy';
import { shouldUseQuerySnapshot } from './snapshot-policy';

interface RequestOptions {
    refreshAfterMs?: number;
    timeoutMs?: number;
    forceRefresh?: boolean;
}

function canonical(value: JsonValue): JsonValue {
    if (Array.isArray(value)) {
        return value.map(canonical);
    }
    const object = record(value);
    if (object) {
        return Object.fromEntries(
            Object.entries(object)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, entry]) => [key, canonical(entry)])
        );
    }
    return value;
}

function querySnapshotKey<TVariables>(document: { toString(): string }, variables: TVariables) {
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
    document: Parameters<typeof graphql<TResult, TVariables>>[1],
    variables: TVariables,
    options: RequestOptions
) {
    const operation = document.toString().match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? 'anonymous';
    const data = await coordinatedAniListRequest(operation, () =>
        graphql('https://graphql.anilist.co', document, variables, { timeoutMs: options.timeoutMs })
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
    } catch (cause) {
        logger.debug('AniList query snapshot write failed', cause);
    }

    return data;
}

async function refreshWithLock<TResult, TVariables>(
    key: string,
    document: Parameters<typeof graphql<TResult, TVariables>>[1],
    variables: TVariables,
    options: RequestOptions,
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
        let storedObject: ReturnType<typeof record> = null;
        if (stored) {
            const parsedStored = z.json().safeParse(stored.data);
            storedObject = parsedStored.success ? record(parsedStored.data) : null;
            if (!storedObject) {
                await tx.delete(anilistQuerySnapshot).where(eq(anilistQuerySnapshot.key, key));
            } else if (
                shouldUseQuerySnapshot(
                    stored,
                    requestedAt,
                    options.forceRefresh === true,
                    requestedAt
                )
            ) {
                return storedObject as TResult;
            }
        }

        try {
            return await refresh(tx, key, document, variables, options);
        } catch (cause) {
            if (storedObject && !options.forceRefresh) {
                logger.debug('AniList query snapshot refresh failed; using stored data', cause);
                return storedObject as TResult;
            }

            throw cause;
        }
    });
}

export async function request<TResult, TVariables>(
    document: Parameters<typeof graphql<TResult, TVariables>>[1],
    variables: TVariables,
    options: RequestOptions = {}
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
            const object = parsedStored.success ? record(parsedStored.data) : null;
            if (!object) {
                await db.delete(anilistQuerySnapshot).where(eq(anilistQuerySnapshot.key, key));
            } else if (
                shouldUseQuerySnapshot(
                    stored,
                    requestedAt,
                    options.forceRefresh === true,
                    requestedAt
                )
            ) {
                return object as TResult;
            }
        }
    } catch (cause) {
        logger.debug('AniList query snapshot read failed', cause);
    }

    return refreshWithLock(key, document, variables, options, requestedAt);
}
