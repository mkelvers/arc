<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import type { EpisodeSkipTimes, SegmentTemplates } from '$lib/player/skip-times';
    import type { Sources } from '$lib/player/media';
    import { SpinnerGapIcon } from 'phosphor-svelte';
    import VideoPlayer from './VideoPlayer.svelte';

    interface Playback {
        streams: Sources;
        error: boolean;
    }

    interface Props {
        animeId: number;
        episodeId: string;
        episodeNumber: number;
        label: string;
        next?: string | null;
        playback: Promise<Playback>;
        poster?: string | null;
        segments: {
            canEdit: boolean;
            times: Promise<EpisodeSkipTimes>;
            templates: Promise<SegmentTemplates>;
        };
        startAt?: number;
    }

    interface ActiveEpisode {
        animeId: number;
        episodeId: string;
        episodeNumber: number;
        label: string;
        next: string | null;
        poster: string | null;
        result: Playback;
        segments: {
            canEdit: boolean;
            times: EpisodeSkipTimes;
            templates: SegmentTemplates;
        };
        startAt: number;
    }

    let {
        animeId,
        episodeId,
        episodeNumber,
        label,
        next = null,
        playback,
        poster = null,
        segments,
        startAt = 0,
    }: Props = $props();
    let active = $state<ActiveEpisode | null>(null);
    let transitioning = $state(true);
    let retrying = $state(false);

    $effect(() => {
        const playbackRequest = playback;
        const skipTimesRequest = segments.times;
        const segmentTemplatesRequest = segments.templates;
        const pending = {
            animeId,
            episodeId,
            episodeNumber,
            label,
            next,
            poster,
            startAt,
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
                        active?.animeId !== pending.animeId ||
                        active.episodeId !== pending.episodeId
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
                        active?.animeId !== pending.animeId ||
                        active.episodeId !== pending.episodeId
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
        animeId={active.animeId}
        episodeId={active.episodeId}
        episodeNumber={active.episodeNumber}
        sources={active.result.streams}
        label={active.label}
        poster={active.poster}
        next={active.next}
        startAt={active.startAt}
        segments={active.segments}
        unavailable={!Object.values(active.result.streams).some((streams) => streams?.length)}
        error={active.result.error}
        transitioning={transitioning}
        retrying={retrying}
        onretry={retry}
    />
{:else}
    <section
        aria-label={`${label} player`}
        aria-busy="true"
        class="relative grid aspect-21/9 w-full place-items-center overflow-hidden bg-black px-6 text-center"
    >
        {#if poster}
            <img
                src={poster}
                alt=""
                class="absolute inset-0 size-full scale-105 object-cover opacity-35 blur-xl"
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
