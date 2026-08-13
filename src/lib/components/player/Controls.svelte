<script lang="ts">
    import type { Player } from '$lib/player/controller.svelte';
    import {
        CornersInIcon,
        CornersOutIcon,
        GearIcon,
        PauseIcon,
        PlayIcon,
        SpeakerHighIcon,
        SpeakerSlashIcon,
    } from 'phosphor-svelte';
    import Settings from './Settings.svelte';
    import Timeline from './Timeline.svelte';

    interface Props {
        player: Player;
    }

    let { player }: Props = $props();
</script>

<div
    class:pointer-events-none={!player.controlsVisible && player.media.playing}
    class:opacity-0={!player.controlsVisible && player.media.playing}
    class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/45 to-transparent px-4 pt-16 pb-4 text-white transition-opacity duration-300 sm:px-6 sm:pb-5"
>
    <div class="flex items-center justify-between px-1">
        <div class="flex items-center gap-4">
            <button
                type="button"
                aria-label={player.media.playing ? 'Pause' : 'Play'}
                disabled={player.media.loading}
                class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white disabled:opacity-50"
                onclick={() => {
                    player.media.togglePlayback();
                    player.showControls();
                }}
            >
                {#if player.media.playing}
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
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={player.media.muted ? 0 : player.media.volume}
                            aria-label="Volume"
                            disabled={player.media.loading}
                            class="volume-input absolute inset-0 size-full cursor-pointer"
                            oninput={(event) => player.media.setVolume(Number(event.currentTarget.value))}
                        />
                    </div>
                </div>

                <button
                    type="button"
                    aria-label={player.media.muted ? 'Unmute' : 'Mute'}
                    disabled={player.media.loading}
                    class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white disabled:opacity-50"
                    onclick={() => {
                        player.media.toggleMute();
                        player.showControls();
                    }}
                >
                    {#if player.media.muted}
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
                    disabled={player.media.loading}
                    class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white disabled:opacity-50"
                    onclick={() => player.openSettings()}
                >
                    <GearIcon size="1.5rem" aria-hidden="true" />
                </button>

                {#if player.settingsOpen}
                    <Settings player={player} />
                {/if}
            </div>

            <button
                type="button"
                aria-label={player.fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                disabled={player.media.loading}
                class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white disabled:opacity-50"
                onclick={() => {
                    void player.toggleFullscreen();
                    player.showControls();
                }}
            >
                {#if player.fullscreen}
                    <CornersInIcon size="1.5rem" weight="bold" aria-hidden="true" />
                {:else}
                    <CornersOutIcon size="1.5rem" weight="bold" aria-hidden="true" />
                {/if}
            </button>
        </div>
    </div>

    <Timeline player={player} />
</div>
