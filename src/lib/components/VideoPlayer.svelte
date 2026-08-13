<script lang="ts">
    import { Player } from '$lib/player/controller.svelte';
    import { subtitleBackgrounds, subtitleSizes, subtitleTextColors, type Sources } from '$lib/player/media';
    import type { EpisodeSkipTimes, SegmentTemplates } from '$lib/player/skip-times';
    import { onMount, untrack } from 'svelte';
    import { SpinnerGapIcon } from 'phosphor-svelte';
    import Controls from './player/Controls.svelte';

    interface Props {
        animeId: number;
        episodeId: string;
        episodeNumber: number;
        sources: Sources;
        label: string;
        poster?: string | null;
        next?: string | null;
        onretry: () => void;
        startAt?: number;
        progressEventAt: number;
        segments: {
            canEdit: boolean;
            times: EpisodeSkipTimes;
            templates: SegmentTemplates;
        };
        error: boolean;
        transitioning: boolean;
        unavailable: boolean;
        retrying: boolean;
    }

    let {
        animeId,
        episodeId,
        episodeNumber,
        sources,
        label,
        poster = null,
        next = null,
        onretry,
        startAt = 0,
        progressEventAt,
        segments,
        error,
        transitioning,
        unavailable,
        retrying,
    }: Props = $props();
    const player = untrack(
        () =>
            new Player({
                animeId,
                episodeId,
                episodeNumber,
                next,
                progressEventAt,
                sources,
                startAt,
                segments,
            })
    );

    $effect(() => {
        player.sync({
            animeId,
            episodeId,
            episodeNumber,
            next,
            progressEventAt,
            sources,
            startAt,
            segments,
        });
    });

    onMount(() => player.mount());
</script>

<!-- The focusable section owns player-wide shortcuts and surface clicks. -->
<div
    bind:this={player.container}
    aria-label={`${label} player`}
    role="application"
    tabindex="-1"
    class:cursor-none={player.media.playing && !player.controlsVisible}
    class:h-full={player.fullscreen}
    class="group relative aspect-21/9 w-full overflow-hidden bg-black focus:outline-none"
>
    <video
        bind:this={player.media.video}
        class="size-full bg-black object-cover"
        playsinline
        preload="metadata"
        poster={poster}
    ></video>

    {#if player.media.subtitles.length}
        <div
            aria-live="off"
            class="pointer-events-none absolute inset-x-6 bottom-20 z-10 flex flex-col items-center gap-1 text-center leading-snug font-semibold text-white"
        >
            {#each player.media.subtitles as subtitle}
                <span
                    class:subtitle-outline={player.media.captions.edgeStyle === 'outline'}
                    class="whitespace-pre-line px-2 py-0.5"
                    style:color={subtitleTextColors[player.media.captions.textColor].value}
                    style:font-size={`${subtitleSizes[player.media.captions.size].px}px`}
                    style:background-color={subtitleBackgrounds[player.media.captions.background].value === null
                        ? 'transparent'
                        : `rgb(${subtitleBackgrounds[player.media.captions.background].value} / ${player.media.captions.backgroundOpacity})`}
                >
                    {subtitle}
                </span>
            {/each}
        </div>
    {/if}

    {#if transitioning || player.changingEpisode}
        <div
            role="status"
            aria-label="Loading next episode"
            class="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/80"
        >
            <SpinnerGapIcon size="2.5rem" weight="bold" class="animate-spin text-accent" aria-hidden="true" />
        </div>
    {:else if unavailable}
        <div role="alert" class="absolute inset-0 z-20 grid place-items-center bg-black px-6 text-center">
            <div>
                <p class="text-base font-bold">
                    {error
                        ? 'The streaming providers could not load this video.'
                        : 'No video source is available.'}
                </p>
                <p class="mt-2 text-sm text-white/65">Arc tried every available source for this episode.</p>
                <button
                    type="button"
                    disabled={retrying}
                    class="mt-5 min-h-11 border border-white/60 px-5 text-sm font-bold hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-60"
                    onclick={onretry}
                >
                    {retrying ? 'Trying again…' : 'Try again'}
                </button>
            </div>
        </div>
    {:else if player.media.loading}
        <div
            role="status"
            aria-label="Loading video"
            class="pointer-events-none absolute inset-0 grid place-items-center bg-black/40"
        >
            <SpinnerGapIcon size="2.5rem" weight="bold" class="animate-spin text-accent" aria-hidden="true" />
        </div>
    {/if}

    {#if player.media.error && !unavailable && !transitioning && !player.changingEpisode}
        <div role="alert" class="absolute inset-0 z-20 grid place-items-center bg-black px-6 text-center">
            <div>
                <p class="text-base font-bold">This video could not be loaded.</p>
                <p class="mt-2 text-sm text-white/65">Every available provider source was tried.</p>
                <button
                    type="button"
                    class="mt-5 min-h-11 border border-white/60 px-5 text-sm font-bold hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    onclick={() => player.media.retry()}
                >
                    Try again
                </button>
            </div>
        </div>
    {/if}

    {#if !unavailable && !transitioning && !player.changingEpisode && !player.media.error}
        {@const skip = player.visibleSkip}
        {#if skip}
            <button
                type="button"
                disabled={player.media.loading}
                class="absolute right-4 bottom-24 z-20 min-h-11 rounded-sm bg-white/95 px-5 text-sm font-bold text-black shadow-[0_3px_14px_rgba(0,0,0,0.3)] backdrop-blur-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50 sm:right-6 sm:bottom-28"
                onclick={() => {
                    player.media.seek(skip.interval.end);
                    player.showControls();
                }}
            >
                Skip {skip.kind === 'opening' ? 'intro' : 'outro'}
            </button>
        {/if}
    {/if}

    <Controls player={player} />
</div>
