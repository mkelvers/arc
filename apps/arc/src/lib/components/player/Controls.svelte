<script lang="ts">
    import type { Player } from '$lib/player/controller.svelte';
    import {
        ArchiveIcon,
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
    import { m } from '$lib/i18n.svelte';

    interface Props {
        player: Player;
        hasMultipleEpisodes?: boolean;
        episodesOpen?: boolean;
        onopenepisodes?: () => void;
    }

    let { player, hasMultipleEpisodes = false, episodesOpen = false, onopenepisodes }: Props = $props();
</script>

<div
    class:pointer-events-none={!player.controlsVisible && player.media.playing}
    class:opacity-0={!player.controlsVisible && player.media.playing}
    class="absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-black/95 via-black/50 to-transparent px-4 pt-20 pb-[max(1rem,env(safe-area-inset-bottom))] text-white transition-opacity duration-300 sm:px-6 sm:pb-5"
>
    <div class="flex items-center justify-between px-1">
        <div class="flex items-center gap-4">
            <button
                type="button"
                aria-label={player.media.playing ? m.player_pause() : m.player_play()}
                disabled={player.media.loading}
                class="grid size-11 cursor-pointer place-items-center transition-[opacity,transform] duration-150 hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white active:scale-90 disabled:cursor-not-allowed disabled:opacity-50 sm:size-8"
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
                    class="pointer-events-none absolute inset-x-0 bottom-full mx-auto flex h-40 w-8 items-end justify-center pb-3 opacity-0 transition-opacity group-hover/volume:pointer-events-auto group-hover/volume:opacity-100 group-focus-within/volume:pointer-events-auto group-focus-within/volume:opacity-100"
                >
                    <div class="relative h-28 w-8 py-1.5">
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={player.media.muted ? 0 : player.media.volume}
                            aria-label={m.player_volume()}
                            disabled={player.media.loading}
                            class="absolute inset-0 size-full cursor-pointer accent-accent [direction:rtl] [writing-mode:vertical-lr]"
                            oninput={(event) => player.media.setVolume(Number(event.currentTarget.value))}
                        />
                    </div>
                </div>

                <button
                    type="button"
                    aria-label={player.media.muted ? m.player_unmute() : m.player_mute()}
                    disabled={player.media.loading}
                    class="grid size-11 cursor-pointer place-items-center transition-[opacity,transform] duration-150 hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white active:scale-90 disabled:cursor-not-allowed disabled:opacity-50 sm:size-8"
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
            {#if hasMultipleEpisodes && onopenepisodes}
                <button
                    type="button"
                    aria-label={episodesOpen ? m.player_close_episodes() : m.player_episodes()}
                    aria-haspopup="dialog"
                    aria-expanded={episodesOpen}
                    aria-controls="episode-dialog"
                    class="grid size-11 cursor-pointer place-items-center transition-[opacity,transform] duration-150 hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white active:scale-90 sm:size-8"
                    onclick={onopenepisodes}
                >
                    <ArchiveIcon size="1.5rem" weight="bold" aria-hidden="true" />
                </button>
            {/if}

            <div class="relative">
                <button
                    type="button"
                    aria-label={m.player_settings()}
                    aria-expanded={player.settingsOpen}
                    aria-controls="player-settings"
                    disabled={player.media.loading}
                    class="grid size-11 cursor-pointer place-items-center transition-[opacity,transform] duration-150 hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white active:scale-90 disabled:cursor-not-allowed disabled:opacity-50 sm:size-8"
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
                aria-label={player.fullscreen ? m.player_exit_fullscreen() : m.player_fullscreen()}
                disabled={player.media.loading}
                class="grid size-11 cursor-pointer place-items-center transition-[opacity,transform] duration-150 hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white active:scale-90 disabled:cursor-not-allowed disabled:opacity-50 sm:size-8"
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
