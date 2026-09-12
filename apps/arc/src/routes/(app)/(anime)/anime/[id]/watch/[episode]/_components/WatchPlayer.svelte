<script lang="ts">
    import { audioModeOrder, WatchPlaybackSchema } from '@arc/core/client';
    import type { AnimeEpisode } from '@arc/core/client';
    import type { Sources } from '$lib/player/media';
    import { preferManualSkipTimes, type EpisodeSkipTimes, type SegmentTemplates } from '@arc/core/client';
    import Spinner from '$lib/components/ui/Spinner.svelte';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import VideoPlayer from '$lib/components/VideoPlayer.svelte';
    import { m } from '$lib/i18n.svelte';

    interface Playback {
        streams: Sources;
        skipTimes: EpisodeSkipTimes | null;
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
        playback: Playback;
        poster?: string | null;
        segments: {
            canEdit: boolean;
            times: EpisodeSkipTimes;
            templates: SegmentTemplates;
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
    let retrying = $state(false);

    // Playback and segment data are resolved by the page load. Keep the
    // current player mounted while navigation updates its input, and only
    // merge in a background refresh when the initial response was incomplete.
    $effect(() => {
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
        active = {
            ...pending,
            result: playback,
            segments: {
                canEdit: segments.canEdit,
                times: preferManualSkipTimes(playback.skipTimes, segments.times),
                templates: segments.templates,
            },
        };

        const missingModes = audioModeOrder.filter(
            (mode) => mode in playback.streams && !playback.streams[mode]?.length
        );
        if (!missingModes.length) {
            return;
        }

        let cancelled = false;
        void fetch(playbackEndpoint, { cache: 'no-store' })
            .then(async (response) => {
                if (!response.ok) {
                    return null;
                }
                return WatchPlaybackSchema.parse(await response.json());
            })
            .then((resolved) => {
                const current = active;
                if (
                    !resolved ||
                    cancelled ||
                    !current ||
                    current.anime.id !== pending.anime.id ||
                    current.currentEpisode.id !== pending.currentEpisode.id
                ) {
                    return;
                }

                const streams = { ...current.result.streams };
                for (const mode of audioModeOrder) {
                    const sources = resolved.streams[mode];
                    if (sources?.length) {
                        streams[mode] = [
                            ...(streams[mode] ?? []),
                            ...sources.filter(
                                (source) =>
                                    !streams[mode]?.some(
                                        (existing) =>
                                            existing.url === source.url && existing.provider === source.provider
                                    )
                            ),
                        ];
                    }
                }
                active = {
                    ...current,
                    result: {
                        streams,
                        skipTimes: resolved.skipTimes ?? current.result.skipTimes,
                        error: !Object.values(streams).some((sources) => sources?.length),
                    },
                    segments: resolved.skipTimes
                        ? {
                              ...current.segments,
                              times: preferManualSkipTimes(resolved.skipTimes, current.segments.times),
                          }
                        : current.segments,
                };
            })
            .catch(() => undefined);

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
                active = {
                    ...active,
                    result,
                    segments: result.skipTimes
                        ? {
                              ...active.segments,
                              times: preferManualSkipTimes(result.skipTimes, active.segments.times),
                          }
                        : active.segments,
                };
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
        retrying={retrying}
        onretry={retry}
        onSourceFailure={retry}
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
                class="absolute inset-0 opacity-35"
                imageClass="scale-105 blur-xl"
            />
        {/if}
        <Spinner size="2.5rem" class="relative animate-spin text-accent" label={m.player_loading_video()} />
    </section>
{/if}
