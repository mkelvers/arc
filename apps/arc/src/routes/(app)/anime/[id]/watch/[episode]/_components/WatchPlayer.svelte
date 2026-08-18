<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import type { AnimeEpisode } from '$lib/types';
    import type { Sources } from '$lib/player/media';
    import type { EpisodeSkipTimes, SegmentTemplates } from '$lib/player/skip-times';
    import { SpinnerGapIcon } from 'phosphor-svelte';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import VideoPlayer from '$lib/components/VideoPlayer.svelte';

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
                    times: { opening: null, ending: null, source: null },
                    templates: { opening: null, ending: null },
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

                    active = { ...active, segments: { ...active.segments, times: resolved } };
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

                    active = { ...active, segments: { ...active.segments, templates: resolved } };
                })
                .catch(() => undefined);
        });

        return () => {
            cancelled = true;
        };
    });

    async function retry() {
        retrying = true;

        try {
            await invalidateAll();
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
    />
{:else}
    <section
        aria-label={`${anime.title} player`}
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
        <SpinnerGapIcon
            role="status"
            aria-label="Loading video"
            size="2.5rem"
            weight="bold"
            class="relative animate-spin text-accent"
        />
    </section>
{/if}
