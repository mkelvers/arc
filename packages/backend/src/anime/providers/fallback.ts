import { mergeAudioModes, type AudioMode } from '@arc/shared/audio';
import { availableEpisodeCount, providerEpisodeCount } from '../episodes/policy';
import type { PlaybackProvider, ProviderEpisode, ProviderStream, ProviderStreams } from './types';
import { coversExpectedEpisodes, episodeTitleScore, matchProviderEpisode } from './match';

class ProviderAttemptError extends Error {
    constructor(
        readonly provider: string,
        readonly capability: 'episodes' | 'streams',
        cause: unknown
    ) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        super(`${provider} ${capability} failed: ${detail}`, { cause });
    }
}

interface StreamAttempt {
    provider: PlaybackProvider;
    streams: ProviderStreams;
    errors: ProviderAttemptError[];
}

function timed<T>(
    provider: PlaybackProvider,
    capability: 'episodes' | 'streams',
    timeoutMs: number,
    request: () => Promise<T>
) {
    return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(
            () =>
                reject(new Error(`${provider.name} ${capability} timed out after ${timeoutMs}ms`)),
            timeoutMs
        );

        request().then(
            (value) => {
                clearTimeout(timeout);
                resolve(value);
            },
            (cause) => {
                clearTimeout(timeout);
                reject(cause);
            }
        );
    });
}

export async function settledStreams(
    requests: Promise<{ mode: AudioMode; stream: ProviderStream }>[],
    emptyMessage: string
) {
    const results = await Promise.allSettled(requests);
    const streams: ProviderStreams = {};
    const errors: unknown[] = [];

    for (const result of results) {
        if (result.status === 'rejected') {
            errors.push(result.reason);
            continue;
        }

        const { mode, stream } = result.value;
        streams[mode] = [...(streams[mode] ?? []), stream];
    }

    if (!Object.keys(streams).length) {
        throw new AggregateError(errors, emptyMessage);
    }

    return streams;
}

export function createProviderFallback(providers: readonly PlaybackProvider[], timeoutMs = 12_000) {
    if (!providers.length) {
        throw new TypeError('At least one playback provider is required');
    }

    const episodeRequests = new Map<string, Promise<ProviderEpisode[]>>();
    const streamRequests = new Map<string, Promise<ProviderStreams>>();
    const completedStreams = new Map<string, { streams: ProviderStreams; expiresAt: number }>();
    const backgroundStreams = new Map<string, Promise<ProviderStreams | null>>();
    const health = new Map<string, { failures: number; retryAt: number }>();

    function shared<T>(requests: Map<string, Promise<T>>, key: string, request: () => Promise<T>) {
        const existing = requests.get(key);
        if (existing) {
            return existing;
        }

        const pending = request();
        requests.set(key, pending);
        const cleanup = setTimeout(() => requests.delete(key), Math.max(timeoutMs * 2, 30_000));
        pending.then(
            () => {
                clearTimeout(cleanup);
                if (requests.get(key) === pending) {
                    requests.delete(key);
                }
            },
            () => {
                clearTimeout(cleanup);
                if (requests.get(key) === pending) {
                    requests.delete(key);
                }
            }
        );
        return pending;
    }

    function healthKey(provider: PlaybackProvider, capability: 'episodes' | 'streams') {
        return `${provider.name}:${capability}`;
    }

    function assertAvailable(provider: PlaybackProvider, capability: 'episodes' | 'streams') {
        const state = health.get(healthKey(provider, capability));
        if (state && state.retryAt > Date.now()) {
            throw new Error(
                `${provider.name} ${capability} is cooling down after an upstream outage`
            );
        }
    }

    function markHealthy(provider: PlaybackProvider, capability: 'episodes' | 'streams') {
        health.delete(healthKey(provider, capability));
    }

    function markFailure(
        provider: PlaybackProvider,
        capability: 'episodes' | 'streams',
        cause: unknown
    ) {
        const causes: unknown[] = [cause];
        let outage = false;
        for (let index = 0; index < causes.length; index++) {
            const failure = causes[index];
            if (failure instanceof AggregateError) {
                causes.push(...failure.errors);
            }
            const detail = failure instanceof Error ? failure.message : String(failure);
            if (
                /(?:timed out|captcha|challenge|clearance|fetch failed|network|offline|\b403\b|\b429\b|\b5\d\d\b)/i.test(
                    detail
                )
            ) {
                outage = true;
                break;
            }
        }

        if (!outage) {
            return;
        }

        const key = healthKey(provider, capability);
        const failures = (health.get(key)?.failures ?? 0) + 1;
        health.set(key, {
            failures,
            retryAt: Date.now() + Math.min(5 * 60_000, 30_000 * 2 ** (failures - 1)),
        });
    }

    async function getEpisodes(
        anime: Parameters<PlaybackProvider['getEpisodes']>[0]
    ): Promise<ProviderEpisode[]> {
        const results = await Promise.all(
            providers.map(async (provider) => {
                try {
                    assertAvailable(provider, 'episodes');
                    const episodes = await timed(provider, 'episodes', timeoutMs, () =>
                        shared(episodeRequests, `${provider.name}:${anime.id}`, () =>
                            provider.getEpisodes(anime)
                        )
                    );
                    markHealthy(provider, 'episodes');
                    if (!episodes.length) {
                        throw new Error('the episode inventory was empty');
                    }

                    return { provider, episodes, error: null };
                } catch (cause) {
                    markFailure(provider, 'episodes', cause);
                    return {
                        provider,
                        episodes: [],
                        error: new ProviderAttemptError(provider.name, 'episodes', cause),
                    };
                }
            })
        );
        const errors = results.flatMap(({ error }) => (error ? [error] : []));

        const successful = results.filter(
            (
                result
            ): result is {
                provider: PlaybackProvider;
                episodes: ProviderEpisode[];
                error: null;
            } => Boolean(result.episodes.length)
        );
        const expected = providerEpisodeCount(anime);
        const availableEpisodes = availableEpisodeCount(anime) ?? expected;
        const eligible =
            anime.status === 'FINISHED' && expected && expected > 0
                ? successful.filter(({ episodes }) => coversExpectedEpisodes(episodes, expected))
                : successful;
        if (!eligible.length && successful.length) {
            throw new AggregateError(
                successful.map(
                    ({ provider, episodes }) =>
                        new ProviderAttemptError(
                            provider.name,
                            'episodes',
                            new Error(
                                `incomplete inventory: expected episodes 1-${expected}, received ${episodes.length} entries`
                            )
                        )
                ),
                `No playback provider returned the complete finished release for AniList ${anime.id}`
            );
        }
        const inventoryPenalty = (inventory: ProviderEpisode[]) => {
            if (!availableEpisodes || availableEpisodes <= 0) {
                return 0;
            }

            const covered = new Set(
                inventory.flatMap(({ number }) =>
                    Number.isInteger(number) && number > 0 && number <= availableEpisodes
                        ? [number]
                        : []
                )
            );
            const missing = availableEpisodes - covered.size;

            return missing * 10_000 + Math.abs(inventory.length - availableEpisodes);
        };
        const numberedInventories = eligible.map(
            ({ episodes }) => new Map(episodes.map((episode) => [episode.number, episode]))
        );
        const inventoryAgreement = eligible.map(({ episodes }, inventoryIndex) =>
            episodes.reduce(
                (agreement, episode) =>
                    agreement +
                    numberedInventories.filter((inventory, index) => {
                        if (index === inventoryIndex || !episode.title) {
                            return false;
                        }
                        const alternate = inventory.get(episode.number);
                        return Boolean(
                            alternate?.title &&
                            episodeTitleScore(episode.title, alternate.title) >= 60
                        );
                    }).length,
                0
            )
        );
        const canonicalIndex = eligible.reduce((best, result, index) => {
            const penalty = inventoryPenalty(result.episodes);
            const bestPenalty = inventoryPenalty(eligible[best].episodes);
            if (penalty !== bestPenalty) {
                return penalty < bestPenalty ? index : best;
            }

            return inventoryAgreement[index] > inventoryAgreement[best] ? index : best;
        }, 0);
        const canonical = eligible[canonicalIndex];
        const alternates = eligible.filter((_, index) => index !== canonicalIndex);

        if (canonical) {
            const episodes = canonical.episodes.map((episode) => ({
                ...episode,
                audio: mergeAudioModes([], episode.audio),
            }));

            for (const { episodes: inventory } of alternates) {
                for (const alternate of inventory) {
                    const episode = matchProviderEpisode(episodes, alternate);
                    if (episode) {
                        episode.audio = mergeAudioModes(episode.audio, alternate.audio);
                        if (!episode.title && alternate.title) {
                            episode.title = alternate.title;
                        }
                        continue;
                    }

                    if (episodes.some(({ number }) => number === alternate.number)) {
                        continue;
                    }

                    const fillsExpectedGap =
                        Number.isInteger(alternate.number) &&
                        alternate.number > 0 &&
                        alternate.number <= (availableEpisodes ?? 0);
                    const possibleSpecial =
                        (alternate.number <= 0 || !Number.isInteger(alternate.number)) &&
                        Boolean(alternate.title.trim());
                    if (!fillsExpectedGap && !possibleSpecial) {
                        continue;
                    }

                    episodes.push({
                        ...alternate,
                        audio: mergeAudioModes([], alternate.audio),
                        supplemental: true,
                    });
                }
            }

            return episodes.toSorted((left, right) => left.number - right.number);
        }

        throw new AggregateError(
            errors,
            `No playback provider returned episodes for AniList ${anime.id}`
        );
    }

    async function getStreams(
        anime: Parameters<PlaybackProvider['getStreams']>[0],
        episode: Parameters<PlaybackProvider['getStreams']>[1],
        modes: AudioMode[]
    ): Promise<ProviderStreams> {
        const requested = [...new Set(modes)];
        if (!requested.length) {
            throw new TypeError('At least one audio mode is required');
        }

        const requestKey = [anime.id, episode.id, episode.number, requested.join(',')].join(':');
        const cached = completedStreams.get(requestKey);
        if (cached) {
            if (cached.expiresAt > Date.now()) {
                return cached.streams;
            }
            completedStreams.delete(requestKey);
        }
        const background = backgroundStreams.get(requestKey);
        if (background) {
            const resolved = await background;
            if (resolved) {
                return resolved;
            }
        }

        const streams: ProviderStreams = Object.fromEntries(requested.map((mode) => [mode, []]));
        const settledResults = new Map<PlaybackProvider, StreamAttempt>();
        const attempts = providers.map(async (provider): Promise<StreamAttempt> => {
            try {
                assertAvailable(provider, 'streams');
                const result = await timed(provider, 'streams', timeoutMs, () =>
                    shared(
                        streamRequests,
                        [
                            provider.name,
                            anime.id,
                            episode.id,
                            episode.number,
                            requested.join(','),
                        ].join(':'),
                        () => provider.getStreams(anime, episode, requested)
                    )
                );
                markHealthy(provider, 'streams');

                const missing = requested.filter((mode) => !result[mode]?.length);
                const attempt = {
                    provider,
                    streams: result,
                    errors: missing.length
                        ? [
                              new ProviderAttemptError(
                                  provider.name,
                                  'streams',
                                  new Error(`no ${missing.join('/')} stream was returned`)
                              ),
                          ]
                        : [],
                };
                settledResults.set(provider, attempt);
                return attempt;
            } catch (cause) {
                markFailure(provider, 'streams', cause);
                const attempt = {
                    provider,
                    streams: {} satisfies ProviderStreams,
                    errors: [new ProviderAttemptError(provider.name, 'streams', cause)],
                };
                settledResults.set(provider, attempt);
                return attempt;
            }
        });
        const allResults = Promise.all(attempts);
        const mergeResults = (results: StreamAttempt[]) => {
            const merged: ProviderStreams = Object.fromEntries(requested.map((mode) => [mode, []]));
            for (const attempt of results) {
                for (const mode of requested) {
                    const existing = merged[mode] ?? [];
                    const additions = (attempt.streams[mode] ?? []).map(
                        (stream): ProviderStream => ({
                            ...stream,
                            provider: attempt.provider.name,
                        })
                    );
                    const seen = new Set(
                        existing.map((stream) => `${stream.url}\n${stream.subtitleUrl ?? ''}`)
                    );
                    merged[mode] = [
                        ...existing,
                        ...additions.filter((stream) => {
                            const key = `${stream.url}\n${stream.subtitleUrl ?? ''}`;
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        }),
                    ];
                }
            }
            return merged;
        };
        const firstAvailable = Promise.any(
            attempts.map(async (attempt) => {
                const result = await attempt;
                if (requested.some((mode) => result.streams[mode]?.length)) {
                    return result;
                }

                throw new Error('Provider returned no requested audio mode');
            })
        );
        const result = await Promise.race([
            firstAvailable.then(
                (available) => ({ kind: 'available' as const, result: available }),
                () => new Promise<never>(() => undefined)
            ),
            allResults.then((results) => ({ kind: 'all' as const, results })),
        ]);
        const mergedResults =
            result.kind === 'available'
                ? providers.flatMap((provider) => settledResults.get(provider) ?? [])
                : result.results;
        const errors = mergedResults.flatMap((attempt) => attempt.errors);
        Object.assign(streams, mergeResults(mergedResults));

        if (result.kind === 'available') {
            const background = allResults
                .then((results) => {
                    const completed = mergeResults(results);
                    if (!requested.every((mode) => completed[mode]?.length)) {
                        return null;
                    }
                    completedStreams.set(requestKey, {
                        streams: completed,
                        expiresAt: Date.now() + 2 * 60_000,
                    });
                    return completed;
                })
                .finally(() => backgroundStreams.delete(requestKey));
            backgroundStreams.set(requestKey, background);
        }

        if (requested.some((mode) => streams[mode]?.length)) {
            const missing = requested.filter((mode) => !streams[mode]?.length);
            if (missing.length) {
                console.warn(
                    `Playback modes unavailable for AniList ${anime.id} episode ${episode.number}: ${missing.join(', ')}`,
                    errors.map((cause) => (cause instanceof Error ? cause.message : String(cause)))
                );
            }
            return streams;
        }

        throw new AggregateError(
            errors,
            `No playback provider returned a stream for episode ${episode.id}`
        );
    }

    return {
        names: providers.map(({ name }) => name),
        getEpisodes,
        getStreams,
    };
}
