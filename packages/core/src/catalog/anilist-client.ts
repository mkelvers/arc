import { createHash } from 'node:crypto';

import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db, type DatabaseTransaction } from '@arc/shared/db';
import { anilistQuerySnapshot } from '@arc/shared/db/schema';
import { GraphQLRequestError } from '@arc/shared/graphql/error';
import { coordinatedAniListRequest } from './anilist-lease';

const aniListEndpoint = 'https://graphql.anilist.co';

interface Document<TResult, TVariables> extends DocumentTypeDecoration<TResult, TVariables> {
    toString(): string;
}

export interface AniListRequestOptions {
    refreshAfterMs?: number;
    timeoutMs?: number;
    forceRefresh?: boolean;
    retries?: number;
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
    document: Document<unknown, TVariables>,
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

function retryAfterMs(response: Response) {
    const value = response.headers.get('Retry-After');
    if (!value) {
        return undefined;
    }

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1_000;
    }

    const date = Date.parse(value);
    return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

const payloadSchema = z.preprocess(
    (value) => {
        try {
            return JSON.parse(String(value));
        } catch {
            return undefined;
        }
    },
    z.object({
        data: z.unknown().optional(),
        errors: z
            .array(
                z.object({
                    message: z.string(),
                    status: z.number().optional(),
                })
            )
            .optional(),
    })
);

export async function graphql<TResult, TVariables>(
    endpoint: string,
    document: Document<TResult, TVariables>,
    variables: TVariables,
    options: AniListRequestOptions = {}
) {
    for (let attempt = 0; ; attempt += 1) {
        try {
            let response: Response;
            let responseText: string;

            try {
                response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'Arc/0.1',
                    },
                    body: JSON.stringify({
                        query: document.toString(),
                        variables,
                    }),
                    signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
                });
                responseText = await response.text();
            } catch (cause) {
                throw new GraphQLRequestError({
                    message: 'The GraphQL endpoint could not be reached',
                    cause,
                });
            }

            const result = payloadSchema.safeParse(responseText || undefined);
            if (!result.success) {
                if (!response.ok) {
                    const preview = responseText.replace(/\s+/g, ' ').trim().slice(0, 300);
                    throw new GraphQLRequestError({
                        message: preview
                            ? `The GraphQL endpoint returned ${response.status}: ${preview}`
                            : `The GraphQL endpoint returned ${response.status}`,
                        status: response.status,
                        retryAfterMs: retryAfterMs(response),
                        cause: result.error,
                    });
                }

                throw new GraphQLRequestError({
                    message: 'The GraphQL endpoint returned an invalid response',
                    cause: result.error,
                });
            }

            const graphQLError = result.data.errors?.[0];
            if (graphQLError) {
                throw new GraphQLRequestError({
                    message: graphQLError.message,
                    status: graphQLError.status ?? (!response.ok ? response.status : undefined),
                    retryAfterMs: retryAfterMs(response),
                });
            }

            if (!response.ok) {
                throw new GraphQLRequestError({
                    message: `The GraphQL endpoint returned ${response.status}`,
                    status: response.status,
                    retryAfterMs: retryAfterMs(response),
                });
            }

            if (result.data.data == null) {
                throw new GraphQLRequestError({
                    message: 'The GraphQL endpoint returned no data',
                });
            }

            return result.data.data as TResult;
        } catch (cause) {
            const retryable =
                cause instanceof GraphQLRequestError &&
                (cause.status == null || cause.status === 429 || cause.status >= 500);
            if (!retryable || attempt >= (options.retries ?? 0)) {
                throw cause;
            }

            await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
        }
    }
}

async function refresh<TResult, TVariables>(
    tx: DatabaseTransaction,
    key: string,
    document: Document<TResult, TVariables>,
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
    document: Document<TResult, TVariables>,
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
    document: Document<TResult, TVariables>,
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

export { GraphQLRequestError };
