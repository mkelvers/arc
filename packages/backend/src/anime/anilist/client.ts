import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@arc/db';
import { anilistQueryCache } from '@arc/db/schema';
import { graphql } from '../../graphql';
import { record, type JsonValue } from '../../utils';
import { anilistRequestPolicy } from './request-policy';

const requests = new Map<string, Promise<unknown>>();

interface RequestOptions {
    cacheForMs?: number;
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

function cacheKey<TVariables>(document: { toString(): string }, variables: TVariables) {
    const parsedVariables = z.json().parse(JSON.parse(JSON.stringify(variables)));
    const serializedVariables = JSON.stringify(canonical(parsedVariables)) ?? 'null';
    return createHash('sha256')
        .update(document.toString())
        .update('\0')
        .update(serializedVariables)
        .digest('hex');
}

async function refresh<TResult, TVariables>(
    key: string,
    document: Parameters<typeof graphql<TResult, TVariables>>[1],
    variables: TVariables,
    options: RequestOptions
) {
    const data = await anilistRequestPolicy.run(() =>
        graphql('https://graphql.anilist.co', document, variables, { timeoutMs: options.timeoutMs })
    );
    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + (options.cacheForMs ?? 24 * 60 * 60 * 1_000));

    try {
        await db
            .insert(anilistQueryCache)
            .values({ key, data, expiresAt, fetchedAt })
            .onConflictDoUpdate({
                target: anilistQueryCache.key,
                set: { data, expiresAt, fetchedAt },
            });
    } catch (cause) {
        console.warn('AniList query cache write failed', cause);
    }

    return data;
}

function refreshOnce<TResult, TVariables>(
    key: string,
    document: Parameters<typeof graphql<TResult, TVariables>>[1],
    variables: TVariables,
    options: RequestOptions
) {
    const pending = requests.get(key);
    if (pending) {
        return pending as Promise<TResult>;
    }

    const load = refresh(key, document, variables, options);
    requests.set(key, load);

    const cleanup = () => {
        if (requests.get(key) === load) {
            requests.delete(key);
        }
    };
    void load.then(cleanup, cleanup);

    return load;
}

export async function request<TResult, TVariables>(
    document: Parameters<typeof graphql<TResult, TVariables>>[1],
    variables: TVariables,
    options: RequestOptions = {}
) {
    const freshFor = options.cacheForMs ?? 24 * 60 * 60 * 1_000;
    if (!Number.isSafeInteger(freshFor) || freshFor <= 0) {
        throw new RangeError('AniList cache lifetime must be a positive integer');
    }

    const key = cacheKey(document, variables);
    try {
        const [stored] = await db
            .select({
                data: anilistQueryCache.data,
                expiresAt: anilistQueryCache.expiresAt,
            })
            .from(anilistQueryCache)
            .where(eq(anilistQueryCache.key, key))
            .limit(1);

        if (stored) {
            const parsedStored = z.json().safeParse(stored.data);
            const object = parsedStored.success ? record(parsedStored.data) : null;
            if (!object) {
                await db.delete(anilistQueryCache).where(eq(anilistQueryCache.key, key));
            } else {
                if (!options.forceRefresh) {
                    if (stored.expiresAt.getTime() <= Date.now()) {
                        void refreshOnce(key, document, variables, options).catch((cause) => {
                            console.warn('AniList query cache refresh failed', cause);
                        });
                    }
                    return object as TResult;
                }
            }
        }
    } catch (cause) {
        console.warn('AniList query cache read failed', cause);
    }

    return refreshOnce(key, document, variables, options);
}
