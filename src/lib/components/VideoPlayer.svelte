<script lang="ts">
    import { Player } from '$lib/player/controller.svelte';
    import type { Sources } from '$lib/player/media';
    import { onMount } from 'svelte';
    import {
        CornersInIcon,
        CornersOutIcon,
        GearIcon,
        PauseIcon,
        PlayIcon,
        SpeakerHighIcon,
        SpeakerSlashIcon,
        SpinnerGapIcon,
    } from 'phosphor-svelte';
    import Settings from './player/Settings.svelte';
    import Timeline from './player/Timeline.svelte';

    interface Props {
        sources: Sources;
        label: string;
        poster?: string | null;
        next?: string | null;
    }

    let { sources, label, poster = null, next = null }: Props = $props();
    const player = new Player(
        () => sources,
        () => next,
    );
    const media = player.media;

    onMount(() => player.mount());
</script>

<svelte:window
    onpointermove={(event) => player.handlePointerMove(event)}
    onfullscreenchange={() => player.fullscreenChanged()}
/>

<!-- The focusable section owns player-wide shortcuts and surface clicks. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
    bind:this={player.container}
    aria-label={`${label} player`}
    tabindex="-1"
    class:aspect-video={!player.fullscreen}
    class:cursor-none={media.playing && !player.controlsVisible}
    class:h-full={player.fullscreen}
    class="group relative w-full overflow-hidden bg-black focus:outline-none"
    onclick={(event) => player.handleClick(event)}
    ondblclick={(event) => player.handleDoubleClick(event)}
    onkeydown={(event) => player.handleKeydown(event)}
>
    <video
        bind:this={media.video}
        class="size-full bg-black object-contain"
        playsinline
        preload="metadata"
        {poster}
        onloadstart={() => (media.loading = true)}
        onloadedmetadata={() => media.handleMetadata()}
        ondurationchange={() => (media.duration = media.video.duration)}
        ontimeupdate={() => (media.currentTime = media.video.currentTime)}
        onprogress={() => media.updateBuffered()}
        onwaiting={() => (media.loading = true)}
        oncanplay={() => (media.loading = false)}
        onerror={() => void media.tryNextSource()}
        onplaying={() => {
            media.playing = true;
            media.loading = false;
            player.showControls();
        }}
        onpause={() => {
            media.playing = false;
            player.showControls();
        }}
        onended={() => media.ended()}
        onvolumechange={() => media.volumeChanged()}
    >
        {#key media.subtitleUrl}
            <track
                kind="captions"
                src={media.subtitleUrl ?? undefined}
                srclang="en"
                label="English"
                default={Boolean(media.subtitleUrl)}
            />
        {/key}
    </video>

    {#if media.loading}
        <div
            role="status"
            aria-label="Loading video"
            class="pointer-events-none absolute inset-0 grid place-items-center bg-black/40"
        >
            <SpinnerGapIcon
                size="2.5rem"
                weight="bold"
                class="animate-spin text-accent"
                aria-hidden="true"
            />
        </div>
    {/if}

    {#if media.error}
        <div
            role="alert"
            class="absolute inset-0 z-20 grid place-items-center bg-black px-6 text-center"
        >
            <div>
                <p class="text-base font-bold">This video could not be loaded.</p>
                <p class="mt-2 text-sm text-white/65">
                    Every available provider source was tried.
                </p>
                <button
                    type="button"
                    class="mt-5 min-h-11 border border-white/60 px-5 text-sm font-bold hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    onclick={() => media.retry()}
                >
                    Try again
                </button>
            </div>
        </div>
    {/if}

    <div
        class:pointer-events-none={!player.controlsVisible && media.playing}
        class:opacity-0={!player.controlsVisible && media.playing}
        class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/45 to-transparent px-4 pt-16 pb-4 text-white transition-opacity duration-300 sm:px-6 sm:pb-5"
    >
        <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-4">
                <button
                    type="button"
                    aria-label={media.playing ? 'Pause' : 'Play'}
                    class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white"
                    onclick={() => {
                        media.togglePlayback();
                        player.showControls();
                    }}
                >
                    {#if media.playing}
                        <PauseIcon size="1.5rem" aria-hidden="true" />
                    {:else}
                        <PlayIcon size="1.5rem" weight="fill" aria-hidden="true" />
                    {/if}
                </button>

                <div class="group/volume relative">
                    <div
                        class="pointer-events-none absolute bottom-full left-1/2 flex h-40 w-12 -translate-x-1/2 items-end justify-center pb-3 opacity-0 transition-opacity group-hover/volume:pointer-events-auto group-hover/volume:opacity-100 group-focus-within/volume:pointer-events-auto group-focus-within/volume:opacity-100"
                    >
                        <div class="relative h-28 w-8 py-1.5">
                            <div class="relative mx-auto h-full w-1.5 rounded-full bg-white/35 shadow-sm">
                                <span
                                    aria-hidden="true"
                                    class="absolute inset-x-0 bottom-0 rounded-full bg-accent"
                                    style={`height: ${media.volumeProgress}%`}
                                ></span>
                                <span
                                    aria-hidden="true"
                                    class="absolute left-1/2 size-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow-sm ring-1 ring-black/10"
                                    style={`bottom: ${media.volumeProgress}%`}
                                ></span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={media.muted ? 0 : media.volume}
                                aria-label="Volume"
                                class="volume-input absolute inset-0 size-full cursor-pointer opacity-0"
                                oninput={(event) =>
                                    media.setVolume(
                                        Number(event.currentTarget.value),
                                    )}
                            />
                        </div>
                    </div>

                    <button
                        type="button"
                        aria-label={media.muted ? 'Unmute' : 'Mute'}
                        class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white"
                        onclick={() => {
                            media.toggleMute();
                            player.showControls();
                        }}
                    >
                        {#if media.muted}
                            <SpeakerSlashIcon size="1.5rem" aria-hidden="true" />
                        {:else}
                            <SpeakerHighIcon size="1.5rem" aria-hidden="true" />
                        {/if}
                    </button>
                </div>
            </div>

            <div class="flex items-center gap-4">
                <div class="relative">
                    <button
                        type="button"
                        aria-label="Playback settings"
                        aria-expanded={player.settingsOpen}
                        aria-controls="player-settings"
                        class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white"
                        onclick={() => player.openSettings()}
                    >
                        <GearIcon size="1.5rem" aria-hidden="true" />
                    </button>

                    {#if player.settingsOpen}
                        <Settings
                            bind:view={player.settingsView}
                            autoplay={media.autoplay}
                            bestQuality={media.bestQuality}
                            mode={media.mode}
                            qualities={media.qualities}
                            quality={media.quality}
                            qualityText={media.qualityText}
                            audioModes={media.audioModes}
                            onautoplay={() => media.toggleAutoplay()}
                            onmode={(mode) => media.switchMode(mode)}
                            onquality={(quality) =>
                                media.switchQuality(quality)}
                        />
                    {/if}
                </div>

                <button
                    type="button"
                    aria-label={player.fullscreen
                        ? 'Exit fullscreen'
                        : 'Enter fullscreen'}
                    class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white"
                    onclick={() => {
                        void player.toggleFullscreen();
                        player.showControls();
                    }}
                >
                    {#if player.fullscreen}
                        <CornersInIcon
                            size="1.5rem"
                            weight="bold"
                            aria-hidden="true"
                        />
                    {:else}
                        <CornersOutIcon
                            size="1.5rem"
                            weight="bold"
                            aria-hidden="true"
                        />
                    {/if}
                </button>
            </div>
        </div>

        <Timeline
            buffered={media.buffered}
            current={media.currentTime}
            duration={media.duration}
            onactivity={() => player.showControls()}
            ondone={() => player.focus()}
            onscrub={(active) => player.setScrubbing(active)}
            onseek={(seconds) => media.seek(seconds)}
        />
    </div>
</section>
