import { createHash } from 'node:crypto';

import { eq, lte } from 'drizzle-orm';

import { db } from '@arc/db';
import { anilistQueryCache } from '@arc/db/schema';
import { graphql } from '$lib/server/graphql';
import { isRecord, JsonValueSchema, type JsonValue } from '$lib/utils';
import { anilistRequestPolicy } from './request-policy';

const endpoint = 'https://graphql.anilist.co';
const defaultFreshFor = 24 * 60 * 60 * 1_000;
const requests = new Map<string, Promise<unknown>>();
let cleanupAfter = 0;

interface RequestOptions {
    cacheForMs?: number;
    timeoutMs?: number;
    forceRefresh?: boolean;
}

function canonical(value: JsonValue): JsonValue {
    if (Array.isArray(value)) {
        return value.map(canonical);
    }
    const object = isRecord(value);
    if (object) {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, entry]) => [key, canonical(entry)])
        );
    }
    return value;
}

function cacheKey<TVariables>(document: { toString(): string }, variables: TVariables) {
    const parsedVariables = JsonValueSchema.parse(JSON.parse(JSON.stringify(variables)));
    const serializedVariables = JSON.stringify(canonical(parsedVariables)) ?? 'null';
    return createHash('sha256')
        .update(document.toString())
        .update('\0')
        .update(serializedVariables)
        .digest('hex');
}

async function removeExpiredEntries(now: Date) {
    if (cleanupAfter > now.getTime()) {
        return;
    }

    cleanupAfter = now.getTime() + 60 * 60 * 1_000;
    try {
        await db.delete(anilistQueryCache).where(lte(anilistQueryCache.expiresAt, now));
    } catch (cause) {
        console.warn('AniList query cache cleanup failed', cause);
    }
}

async function refresh<TResult, TVariables>(
    key: string,
    document: Parameters<typeof graphql<TResult, TVariables>>[1],
    variables: TVariables,
    options: RequestOptions
) {
    const data = await anilistRequestPolicy.run(() =>
        graphql(endpoint, document, variables, { timeoutMs: options.timeoutMs })
    );
    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + (options.cacheForMs ?? defaultFreshFor));

    try {
        await db
            .insert(anilistQueryCache)
            .values({ key, data, expiresAt, fetchedAt })
            .onConflictDoUpdate({
                target: anilistQueryCache.key,
                set: { data, expiresAt, fetchedAt },
            });
        void removeExpiredEntries(fetchedAt);
    } catch (cause) {
        console.warn('AniList query cache write failed', cause);
    }

    return data;
}

export async function request<TResult, TVariables>(
    document: Parameters<typeof graphql<TResult, TVariables>>[1],
    variables: TVariables,
    options: RequestOptions = {}
) {
    const freshFor = options.cacheForMs ?? defaultFreshFor;
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
        void removeExpiredEntries(new Date());

        if (stored) {
            const parsedStored = JsonValueSchema.safeParse(stored.data);
            if (!parsedStored.success || !isRecord(parsedStored.data)) {
                await db.delete(anilistQueryCache).where(eq(anilistQueryCache.key, key));
            } else if (!options.forceRefresh && stored.expiresAt.getTime() > Date.now()) {
                return parsedStored.data as TResult;
            }
        }
    } catch (cause) {
        console.warn('AniList query cache read failed', cause);
    }

    const pending = requests.get(key);
    if (pending) {
        return pending as Promise<TResult>;
    }

    const load = refresh(key, document, variables, options);
    requests.set(key, load);

    try {
        return await load;
    } finally {
        if (requests.get(key) === load) {
            requests.delete(key);
        }
    }
}
