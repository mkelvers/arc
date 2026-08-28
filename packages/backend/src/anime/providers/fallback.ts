import { mergeAudioModes, type AudioMode } from '@arc/shared/audio';
import { providerEpisodeCount } from '../episodes/policy';
import { coversExpectedEpisodes } from './match';
import type { PlaybackProvider, ProviderEpisode, ProviderStream, ProviderStreams } from './types';

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

export function createProviderFallback(provider: PlaybackProvider | null, timeoutMs = 12_000) {
    if (!provider) {
        return {
            getEpisodes: async (
                _anime: Parameters<PlaybackProvider['getEpisodes']>[0]
            ): Promise<ProviderEpisode[]> => {
                throw new Error('No playback provider is configured');
            },
            getStreams: async (
                _anime: Parameters<PlaybackProvider['getStreams']>[0],
                _episode: Parameters<PlaybackProvider['getStreams']>[1],
                _modes: AudioMode[]
            ): Promise<ProviderStreams> => {
                throw new Error('No playback provider is configured');
            },
        };
    }
    const configuredProvider = provider;

    const health = new Map<string, { failures: number; retryAt: number }>();

    function healthKey(capability: 'episodes' | 'streams') {
        return `${configuredProvider.name}:${capability}`;
    }

    function assertAvailable(capability: 'episodes' | 'streams') {
        const state = health.get(healthKey(capability));
        if (state && state.retryAt > Date.now()) {
            throw new Error(
                `${configuredProvider.name} ${capability} is cooling down after an upstream outage`
            );
        }
    }

    function markHealthy(capability: 'episodes' | 'streams') {
        health.delete(healthKey(capability));
    }

    function markFailure(capability: 'episodes' | 'streams', cause: unknown) {
        const causes: unknown[] = [cause];
        let outage = false;
        for (let index = 0; index < causes.length; index += 1) {
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

        const key = healthKey(capability);
        const failures = (health.get(key)?.failures ?? 0) + 1;
        health.set(key, {
            failures,
            retryAt: Date.now() + Math.min(5 * 60_000, 30_000 * 2 ** (failures - 1)),
        });
    }

    async function getEpisodes(
        anime: Parameters<PlaybackProvider['getEpisodes']>[0]
    ): Promise<ProviderEpisode[]> {
        try {
            assertAvailable('episodes');
            const episodes = await timed(configuredProvider, 'episodes', timeoutMs, () =>
                configuredProvider.getEpisodes(anime)
            );
            if (!episodes.length) {
                throw new Error('the episode inventory was empty');
            }

            const expected = providerEpisodeCount(anime);
            if (
                anime.status === 'FINISHED' &&
                expected &&
                !coversExpectedEpisodes(episodes, expected)
            ) {
                throw new Error(
                    `incomplete inventory: expected episodes 1-${expected}, received ${episodes.length} entries`
                );
            }

            markHealthy('episodes');
            return episodes.map((episode) => ({
                ...episode,
                audio: mergeAudioModes([], episode.audio),
            }));
        } catch (cause) {
            markFailure('episodes', cause);
            throw new AggregateError(
                [new ProviderAttemptError(configuredProvider.name, 'episodes', cause)],
                cause instanceof Error && cause.message.startsWith('incomplete inventory')
                    ? `No playback provider returned the complete finished release for AniList ${anime.id}`
                    : `No playback provider returned episodes for AniList ${anime.id}`
            );
        }
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

        try {
            assertAvailable('streams');
            const result = await timed(configuredProvider, 'streams', timeoutMs, () =>
                configuredProvider.getStreams(anime, episode, requested)
            );
            const streams: ProviderStreams = Object.fromEntries(
                requested.map((mode) => {
                    const seen = new Set<string>();
                    const values = (result[mode] ?? [])
                        .filter((stream) => stream.kind !== 'iframe')
                        .map((stream): ProviderStream => ({
                            ...stream,
                            provider: configuredProvider.name,
                        }))
                        .filter((stream) => {
                            const key = `${stream.kind ?? 'direct'}\n${stream.url}\n${stream.subtitleUrl ?? ''}`;
                            if (seen.has(key)) {
                                return false;
                            }
                            seen.add(key);
                            return true;
                        });
                    return [mode, values];
                })
            );

            if (!Object.values(streams).some((values) => values?.length)) {
                throw new Error('the provider returned no direct streams');
            }

            markHealthy('streams');
            return streams;
        } catch (cause) {
            markFailure('streams', cause);
            throw new AggregateError(
                [new ProviderAttemptError(configuredProvider.name, 'streams', cause)],
                `No playback provider returned a stream for episode ${episode.id}`
            );
        }
    }

    return {
        getEpisodes,
        getStreams,
    };
}
