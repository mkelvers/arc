import { mergeAudioModes, type AudioMode } from '$lib/anime/audio';
import type {
    PlaybackProvider,
    ProviderEpisode,
    ProviderStream,
    ProviderStreams,
} from './types';

export class ProviderAttemptError extends Error {
    constructor(
        readonly provider: string,
        readonly capability: 'episodes' | 'streams',
        cause: unknown,
    ) {
        const detail =
            cause instanceof Error ? cause.message : String(cause);
        super(`${provider} ${capability} failed: ${detail}`, { cause });
    }
}

function timed<T>(
    provider: PlaybackProvider,
    capability: 'episodes' | 'streams',
    timeoutMs: number,
    request: () => Promise<T>,
) {
    return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(
            () =>
                reject(
                    new Error(
                        `${provider.name} ${capability} timed out after ${timeoutMs}ms`,
                    ),
                ),
            timeoutMs,
        );

        request().then(
            (value) => {
                clearTimeout(timeout);
                resolve(value);
            },
            (cause) => {
                clearTimeout(timeout);
                reject(cause);
            },
        );
    });
}

function failureText(cause: unknown): string {
    if (cause instanceof AggregateError) {
        return [cause.message, ...cause.errors.map(failureText)].join(' ');
    }

    return cause instanceof Error ? cause.message : String(cause);
}

function isProviderOutage(cause: unknown) {
    return /(?:timed out|captcha|challenge|clearance|fetch failed|network|offline|\b403\b|\b429\b|\b5\d\d\b)/i.test(
        failureText(cause),
    );
}

export function createProviderFallback(
    providers: readonly PlaybackProvider[],
    timeoutMs = 12_000,
) {
    if (!providers.length) {
        throw new TypeError('At least one playback provider is required');
    }

    const episodeRequests = new Map<string, Promise<ProviderEpisode[]>>();
    const streamRequests = new Map<string, Promise<ProviderStreams>>();
    const health = new Map<string, { failures: number; retryAt: number }>();

    function shared<T>(
        requests: Map<string, Promise<T>>,
        key: string,
        request: () => Promise<T>,
    ) {
        const existing = requests.get(key);
        if (existing) {
            return existing;
        }

        const pending = request();
        requests.set(key, pending);
        const cleanup = setTimeout(
            () => requests.delete(key),
            Math.max(timeoutMs * 2, 30_000),
        );
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
            },
        );
        return pending;
    }

    function healthKey(
        provider: PlaybackProvider,
        capability: 'episodes' | 'streams',
    ) {
        return `${provider.name}:${capability}`;
    }

    function assertAvailable(
        provider: PlaybackProvider,
        capability: 'episodes' | 'streams',
    ) {
        const state = health.get(healthKey(provider, capability));
        if (state && state.retryAt > Date.now()) {
            throw new Error(
                `${provider.name} ${capability} is cooling down after an upstream outage`,
            );
        }
    }

    function markHealthy(
        provider: PlaybackProvider,
        capability: 'episodes' | 'streams',
    ) {
        health.delete(healthKey(provider, capability));
    }

    function markFailure(
        provider: PlaybackProvider,
        capability: 'episodes' | 'streams',
        cause: unknown,
    ) {
        if (!isProviderOutage(cause)) {
            return;
        }

        const key = healthKey(provider, capability);
        const failures = (health.get(key)?.failures ?? 0) + 1;
        health.set(key, {
            failures,
            retryAt:
                Date.now() +
                Math.min(5 * 60_000, 30_000 * 2 ** (failures - 1)),
        });
    }

    async function getEpisodes(
        anime: Parameters<PlaybackProvider['getEpisodes']>[0],
    ): Promise<ProviderEpisode[]> {
        const results = await Promise.all(
            providers.map(async (provider) => {
                try {
                    assertAvailable(provider, 'episodes');
                    const episodes = await timed(
                        provider,
                        'episodes',
                        timeoutMs,
                        () =>
                            shared(
                                episodeRequests,
                                `${provider.name}:${anime.id}`,
                                () => provider.getEpisodes(anime),
                            ),
                    );
                    markHealthy(provider, 'episodes');
                    if (!episodes.length) {
                        throw new Error('the episode inventory was empty');
                    }

                    return { episodes, error: null };
                } catch (cause) {
                    markFailure(provider, 'episodes', cause);
                    return {
                        episodes: [],
                        error: new ProviderAttemptError(
                            provider.name,
                            'episodes',
                            cause,
                        ),
                    };
                }
            }),
        );
        const errors = results.flatMap(({ error }) =>
            error ? [error] : [],
        );

        const episodes = new Map<number, ProviderEpisode>();
        for (const { episodes: inventory } of results) {
            for (const episode of inventory) {
                const stored = episodes.get(episode.number);
                if (!stored) {
                    episodes.set(episode.number, {
                        ...episode,
                        audio: mergeAudioModes([], episode.audio),
                    });
                    continue;
                }

                stored.audio = mergeAudioModes(stored.audio, episode.audio);
                if (!stored.title && episode.title) {
                    stored.title = episode.title;
                }
            }
        }

        if (episodes.size) {
            return [...episodes.values()].sort(
                (left, right) => left.number - right.number,
            );
        }

        throw new AggregateError(
            errors,
            `No playback provider returned episodes for AniList ${anime.id}`,
        );
    }

    async function getStreams(
        anime: Parameters<PlaybackProvider['getStreams']>[0],
        episode: Parameters<PlaybackProvider['getStreams']>[1],
        modes: AudioMode[],
    ): Promise<ProviderStreams> {
        const requested = [...new Set(modes)];
        if (!requested.length) {
            throw new TypeError('At least one audio mode is required');
        }

        const streams: ProviderStreams = Object.fromEntries(
            requested.map((mode) => [mode, []]),
        );
        const results = await Promise.all(
            providers.map(async (provider) => {
                try {
                    assertAvailable(provider, 'streams');
                    const result = await timed(
                        provider,
                        'streams',
                        timeoutMs,
                        () =>
                            shared(
                                streamRequests,
                                [
                                    provider.name,
                                    anime.id,
                                    episode.id,
                                    episode.number,
                                    requested.join(','),
                                ].join(':'),
                                () =>
                                    provider.getStreams(
                                        anime,
                                        episode,
                                        requested,
                                    ),
                            ),
                    );
                    markHealthy(provider, 'streams');

                    const missing = requested.filter(
                        (mode) => !result[mode]?.length,
                    );
                    return {
                        provider,
                        streams: result,
                        errors: missing.length
                            ? [
                                  new ProviderAttemptError(
                                      provider.name,
                                      'streams',
                                      new Error(
                                          `no ${missing.join('/')} stream was returned`,
                                      ),
                                  ),
                              ]
                            : [],
                    };
                } catch (cause) {
                    markFailure(provider, 'streams', cause);
                    return {
                        provider,
                        streams: {},
                        errors: [
                            new ProviderAttemptError(
                                provider.name,
                                'streams',
                                cause,
                            ),
                        ],
                    };
                }
            }),
        );
        const errors = results.flatMap((result) => result.errors);

        for (const result of results) {
            for (const mode of requested) {
                const existing = streams[mode] ?? [];
                const additions = (result.streams[mode] ?? []).map(
                    (stream): ProviderStream => ({
                        ...stream,
                        provider: result.provider.name,
                    }),
                );
                const seen = new Set(
                    existing.map(
                        (stream) =>
                            `${stream.url}\n${stream.subtitleUrl ?? ''}`,
                    ),
                );
                streams[mode] = [
                    ...existing,
                    ...additions.filter((stream) => {
                        const key = `${stream.url}\n${stream.subtitleUrl ?? ''}`;
                        if (seen.has(key)) {
                            return false;
                        }
                        seen.add(key);
                        return true;
                    }),
                ];
            }
        }

        if (requested.some((mode) => streams[mode]?.length)) {
            return streams;
        }

        throw new AggregateError(
            errors,
            `No playback provider returned a stream for episode ${episode.id}`,
        );
    }

    return {
        names: providers.map(({ name }) => name),
        getEpisodes,
        getStreams,
    };
}
