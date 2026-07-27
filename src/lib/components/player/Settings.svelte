<script lang="ts">
    import type { AudioMode } from '$lib/anime/audio';
    import {
        audioLabel,
        isHd,
        type SettingsView,
    } from '$lib/player/media';
    import { CaretLeftIcon, CaretRightIcon } from 'phosphor-svelte';

    interface Props {
        audioModes: AudioMode[];
        autoplay: boolean;
        bestQuality: string | null;
        mode: AudioMode;
        onautoplay: () => void;
        onmode: (mode: AudioMode) => void;
        onquality: (quality: string) => void;
        qualities: string[];
        quality: string;
        qualityText: string;
        view?: SettingsView;
    }

    let {
        audioModes,
        autoplay,
        bestQuality,
        mode,
        onautoplay,
        onmode,
        onquality,
        qualities,
        quality,
        qualityText,
        view = $bindable('main'),
    }: Props = $props();

</script>

{#snippet radio(selected: boolean)}
    <span
        aria-hidden="true"
        class={`grid size-4 place-items-center rounded-full border ${
            selected ? 'border-player-accent' : 'border-white/55'
        }`}
    >
        {#if selected}
            <span class="leading-none text-player-accent">•</span>
        {/if}
    </span>
{/snippet}

<div
    id="player-settings"
    role="menu"
    aria-label="Playback settings"
    class="absolute right-0 bottom-full z-40 mb-2 w-60 overflow-hidden bg-player-panel py-2 text-left text-xs shadow-xl ring-1 ring-white/8"
>
    {#if view === 'main'}
        <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={autoplay}
            class="flex min-h-8 w-full items-center justify-between px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
            onclick={onautoplay}
        >
            <span>Autoplay</span>
            <span
                aria-hidden="true"
                class={`relative h-3.5 w-7 rounded-full border transition-colors ${
                    autoplay
                        ? 'border-player-accent bg-player-accent/20'
                        : 'border-white/55 bg-white/12'
                }`}
            >
                <span
                    class={`absolute top-0.5 left-0.5 size-2 rounded-full transition-all ${
                        autoplay
                            ? 'translate-x-4 bg-player-accent'
                            : 'bg-white'
                    }`}
                ></span>
            </span>
        </button>

        <button
            type="button"
            role="menuitem"
            class="flex min-h-8 w-full items-center justify-between px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
            onclick={() => (view = 'audio')}
        >
            <span>Audio</span>
            <span class="flex items-center gap-1 text-white/85">
                {audioLabel(mode)}
                <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
            </span>
        </button>

        <button
            type="button"
            role="menuitem"
            class="flex min-h-8 w-full items-center justify-between px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
            onclick={() => (view = 'quality')}
        >
            <span>Quality</span>
            <span class="flex items-center gap-1 text-white/85">
                <span>{qualityText}</span>
                {#if isHd(quality === 'best' ? bestQuality : quality)}
                    <span class="font-bold text-accent">HD</span>
                {/if}
                <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
            </span>
        </button>
    {:else}
        <button
            type="button"
            role="menuitem"
            aria-label="Back to playback settings"
            class="flex min-h-8 w-full items-center gap-2 px-4 text-left text-xs font-bold hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
            onclick={() => (view = 'main')}
        >
            <CaretLeftIcon size="0.95rem" weight="bold" aria-hidden="true" />
            {view === 'quality' ? 'Quality' : 'Audio'}
        </button>

        {#if view === 'quality'}
            <button
                type="button"
                role="menuitemradio"
                aria-checked={quality === 'best'}
                class="flex min-h-8 w-full items-center gap-2 px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                onclick={() => onquality('best')}
            >
                {@render radio(quality === 'best')}
                Auto
            </button>

            {#each qualities as option}
                <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={quality === option}
                    class="flex min-h-8 w-full items-center gap-2 px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                    onclick={() => onquality(option)}
                >
                    {@render radio(quality === option)}
                    <span>
                        {option}
                        {#if isHd(option)}
                            <span class="font-bold text-accent">HD</span>
                        {/if}
                    </span>
                </button>
            {/each}
        {:else}
            {#each audioModes as option}
                <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={mode === option}
                    class="flex min-h-8 w-full items-center gap-2 px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                    onclick={() => onmode(option)}
                >
                    {@render radio(mode === option)}
                    {audioLabel(option)}
                </button>
            {/each}
        {/if}
    {/if}
</div>
