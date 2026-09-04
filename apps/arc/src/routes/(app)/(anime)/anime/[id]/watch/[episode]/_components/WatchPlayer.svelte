<script lang="ts">
    import { WatchPlaybackSchema } from '@arc/core/contracts/anime';
    import { audioModeOrder } from '@arc/core/audio';
    import type { AnimeEpisode } from '@arc/core/types';
    import type { Sources } from '$lib/player/media';
    import type { EpisodeSkipTimes, SegmentTemplates } from '@arc/core/player/skip-times';
    import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import VideoPlayer from '$lib/components/VideoPlayer.svelte';
    import { m } from '$lib/i18n.svelte';

    interface Playback {
        streams: Sources;
        error: boolean;
    }

    interface AnimeInfo {
        id: number;
        title: string;
        format?: string | null;
    }

    interface LogoInfo {
        url: string;
        size: number;
    }

    interface Props {
        anime: AnimeInfo;
        logo?: LogoInfo | null;
        currentEpisode: AnimeEpisode;
        episodes: AnimeEpisode[];
        previousEpisode?: AnimeEpisode | null;
        nextEpisode?: AnimeEpisode | null;
        fallbackImage?: string | null;
        playbackEndpoint: string;
        playback: Promise<Playback>;
        poster?: string | null;
        segments: {
            canEdit: boolean;
            times: Promise<EpisodeSkipTimes>;
            templates: Promise<SegmentTemplates>;
        };
        startAt?: number;
        progressEventAt: number;
    }

    interface ActiveEpisode {
        anime: AnimeInfo;
        logo: LogoInfo | null;
        currentEpisode: AnimeEpisode;
        episodes: AnimeEpisode[];
        previousEpisode: AnimeEpisode | null;
        nextEpisode: AnimeEpisode | null;
        fallbackImage: string | null;
        poster: string | null;
        result: Playback;
        segments: {
            canEdit: boolean;
            times: EpisodeSkipTimes;
            templates: SegmentTemplates;
        };
        startAt: number;
        progressEventAt: number;
    }

    let {
        anime,
        logo = null,
        currentEpisode,
        episodes,
        previousEpisode = null,
        nextEpisode = null,
        fallbackImage = null,
        playbackEndpoint,
        playback,
        poster = null,
        segments,
        startAt = 0,
        progressEventAt,
    }: Props = $props();
    let active = $state<ActiveEpisode | null>(null);
    let transitioning = $state(true);
    let retrying = $state(false);

    // Start playback as soon as its sources resolve. Skip data is optional and
    // may fill in later, while the request snapshots prevent an older episode
    // from replacing the persistent player after navigation.
    $effect(() => {
        const playbackRequest = playback;
        const skipTimesRequest = segments.times;
        const segmentTemplatesRequest = segments.templates;
        const pending = {
            anime,
            logo,
            currentEpisode,
            episodes,
            previousEpisode,
            nextEpisode,
            fallbackImage,
            poster,
            startAt,
            progressEventAt,
        };
        let cancelled = false;
        transitioning = true;

        void playbackRequest.then((result) => {
            if (cancelled) {
                return;
            }

            active = {
                ...pending,
                result,
                segments: {
                    canEdit: segments.canEdit,
                    times: {
                        opening: null,
                        ending: null,
                        source: null,
                    },
                    templates: {
                        opening: null,
                        ending: null,
                    },
                },
            };
            transitioning = false;

            void skipTimesRequest
                .then((resolved) => {
                    if (
                        cancelled ||
                        active?.anime.id !== pending.anime.id ||
                        active.currentEpisode.id !== pending.currentEpisode.id
                    ) {
                        return;
                    }

                    active = {
                        ...active,
                        segments: {
                            ...active.segments,
                            times: resolved,
                        },
                    };
                })
                .catch(() => undefined);

            void segmentTemplatesRequest
                .then((resolved) => {
                    if (
                        cancelled ||
                        active?.anime.id !== pending.anime.id ||
                        active.currentEpisode.id !== pending.currentEpisode.id
                    ) {
                        return;
                    }

                    active = {
                        ...active,
                        segments: {
                            ...active.segments,
                            templates: resolved,
                        },
                    };
                })
                .catch(() => undefined);

            const missingModes = audioModeOrder.filter(
                (mode) => mode in result.streams && !result.streams[mode]?.length
            );
            if (missingModes.length) {
                void fetch(playbackEndpoint)
                    .then(async (response) => {
                        if (!response.ok) {
                            return null;
                        }
                        return WatchPlaybackSchema.parse(await response.json());
                    })
                    .then((resolved) => {
                        if (
                            !resolved ||
                            cancelled ||
                            active?.anime.id !== pending.anime.id ||
                            active.currentEpisode.id !== pending.currentEpisode.id
                        ) {
                            return;
                        }

                        const streams = { ...active.result.streams };
                        for (const mode of audioModeOrder) {
                            const sources = resolved.streams[mode];
                            if (sources?.length) {
                                streams[mode] = [
                                    ...(streams[mode] ?? []),
                                    ...sources.filter(
                                        (source) =>
                                            !streams[mode]?.some(
                                                (existing) =>
                                                    existing.url === source.url &&
                                                    existing.provider === source.provider
                                            )
                                    ),
                                ];
                            }
                        }
                        active = {
                            ...active,
                            result: {
                                streams,
                                error: !Object.values(streams).some((sources) => sources?.length),
                            },
                        };
                    })
                    .catch(() => undefined);
            }
        });

        return () => {
            cancelled = true;
        };
    });

    async function retry() {
        retrying = true;

        try {
            const response = await fetch(playbackEndpoint, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Playback request failed with ${response.status}`);
            }

            const result = WatchPlaybackSchema.parse(await response.json());
            if (active) {
                active = { ...active, result };
            }
        } finally {
            retrying = false;
        }
    }
</script>

{#if active}
    <VideoPlayer
        anime={active.anime}
        logo={active.logo}
        currentEpisode={active.currentEpisode}
        episodes={active.episodes}
        previousEpisode={active.previousEpisode}
        nextEpisode={active.nextEpisode}
        fallbackImage={active.fallbackImage}
        sources={active.result.streams}
        poster={active.poster}
        next={active.nextEpisode?.href}
        startAt={active.startAt}
        progressEventAt={active.progressEventAt}
        segments={active.segments}
        unavailable={!Object.values(active.result.streams).some((streams) => streams?.length)}
        error={active.result.error}
        transitioning={transitioning}
        retrying={retrying}
        onretry={retry}
        onSourceFailure={() => void retry()}
    />
{:else}
    <section
        aria-label={m.player_back({ title: anime.title })}
        aria-busy="true"
        class="fixed inset-0 grid size-full place-items-center overflow-hidden bg-black px-6 text-center"
    >
        {#if poster}
            <ProgressiveImage
                src={poster}
                alt=""
                previewSize="w300"
                class="absolute inset-0 opacity-35"
                imageClass="scale-105 blur-xl"
            />
        {/if}
        <LoadingSpinner size="2.5rem" class="relative animate-spin text-accent" label={m.player_loading_video()} />
    </section>
{/if}
