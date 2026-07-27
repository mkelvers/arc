import type { AudioMode } from '$lib/anime/audio';
import type {
    PlaybackProvider,
    ProviderEpisode,
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

export function createProviderFallback(
    providers: readonly PlaybackProvider[],
    timeoutMs = 12_000,
) {
    if (!providers.length) {
        throw new TypeError('At least one playback provider is required');
    }

    async function getEpisodes(
        anime: Parameters<PlaybackProvider['getEpisodes']>[0],
    ): Promise<ProviderEpisode[]> {
        const errors: unknown[] = [];

        for (const provider of providers) {
            try {
                const episodes = await timed(
                    provider,
                    'episodes',
                    timeoutMs,
                    () => provider.getEpisodes(anime),
                );
                if (episodes.length) {
                    return episodes;
                }

                throw new Error('the episode inventory was empty');
            } catch (cause) {
                errors.push(
                    new ProviderAttemptError(
                        provider.name,
                        'episodes',
                        cause,
                    ),
                );
            }
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

        const streams: ProviderStreams = {};
        const errors: unknown[] = [];

        for (const provider of providers) {
            const remaining = requested.filter(
                (mode) => !streams[mode]?.length,
            );
            if (!remaining.length) {
                break;
            }

            try {
                const result = await timed(
                    provider,
                    'streams',
                    timeoutMs,
                    () =>
                        provider.getStreams(
                            anime,
                            episode,
                            remaining,
                        ),
                );

                for (const mode of remaining) {
                    if (result[mode]?.length) {
                        streams[mode] = result[mode];
                    }
                }

                const missing = remaining.filter(
                    (mode) => !streams[mode]?.length,
                );
                if (missing.length) {
                    errors.push(
                        new ProviderAttemptError(
                            provider.name,
                            'streams',
                            new Error(
                                `no ${missing.join('/')} stream was returned`,
                            ),
                        ),
                    );
                }
            } catch (cause) {
                errors.push(
                    new ProviderAttemptError(
                        provider.name,
                        'streams',
                        cause,
                    ),
                );
            }
        }

        if (Object.keys(streams).length) {
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
