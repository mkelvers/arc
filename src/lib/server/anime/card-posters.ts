import { Effect, Either } from 'effect';

import type { AnimeCard } from '$lib/anime/types';
import { GraphQLRequestError } from '$lib/server/graphql';
import { getAnime } from './anilist/details';
import {
    NoConfidentTmdbMappingError,
    resolveStored,
} from './tmdb/mapping';
import { getPoster, getStoredPosters, stalePosterIds } from './tmdb/poster';

const expectedRetryDelay = 6 * 60 * 60 * 1_000;
const transientRetryDelay = 5 * 60 * 1_000;
const requests = new Map<number, Promise<void>>();
const retryAt = new Map<number, number>();

function expectedAbsence(cause: unknown) {
    return (
        cause instanceof NoConfidentTmdbMappingError ||
        (cause instanceof GraphQLRequestError && cause.status === 404)
    );
}

function failureMessage(cause: unknown) {
    return cause instanceof Error ? cause.message : String(cause);
}

async function loadPoster(id: number) {
    const result = await Effect.runPromise(getAnime(id).pipe(Effect.either));
    if (Either.isLeft(result)) {
        throw result.left;
    }

    const match = await resolveStored(result.right);
    await getPoster(result.right, match);
}

function refreshPoster(id: number) {
    if ((retryAt.get(id) ?? 0) > Date.now()) {
        return Promise.resolve();
    }

    const active = requests.get(id);
    if (active) {
        return active;
    }

    const request = loadPoster(id).catch((cause) => {
        const expected = expectedAbsence(cause);
        retryAt.set(
            id,
            Date.now() +
                (expected ? expectedRetryDelay : transientRetryDelay),
        );
        if (expected) {
            return;
        }

        console.warn(
            `Release poster refresh deferred for AniList ${id}: ${failureMessage(cause)}`,
        );
    });
    requests.set(id, request);
    request.finally(() => {
        if (requests.get(id) === request) {
            requests.delete(id);
        }
    });

    return request;
}

async function refreshPosters(anilistIds: number[]) {
    const pending = await stalePosterIds(anilistIds);
    let next = 0;
    const worker = async () => {
        while (next < pending.length) {
            const id = pending[next++];
            if (id != null) {
                await refreshPoster(id);
            }
        }
    };

    await Promise.all(
        Array.from({ length: Math.min(2, pending.length) }, () => worker()),
    );
}

export async function withAnimeCardPosters<T extends AnimeCard>(
    cards: T[],
): Promise<T[]> {
    const anilistIds = [...new Set(cards.map(({ id }) => id))];
    if (!anilistIds.length) {
        return cards;
    }

    const posters = await getStoredPosters(anilistIds);
    void refreshPosters(anilistIds).catch((cause) =>
        console.warn('Anime card poster refresh could not start', cause),
    );

    return cards.map((card) => ({
        ...card,
        image: posters.get(card.id) ?? card.image,
    }));
}
