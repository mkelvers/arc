<script lang="ts">
    import type { Player } from '$lib/player/controller.svelte';
    import { audioLabel, formatTime, isHd, subtitleSizeOrder, subtitleSizes } from '$lib/player/media';
    import type { SkipKind } from '@arc/shared/player/skip-times';
    import { cn } from '$lib/utils';
    import { CaretLeftIcon, CaretRightIcon } from 'phosphor-svelte';

    interface Props {
        player: Player;
    }

    const skipLabels = {
        opening: 'Opening',
        ending: 'Ending',
    } satisfies Record<SkipKind, string>;

    let { player }: Props = $props();
</script>

{#snippet radio(selected: boolean)}
    <span
        aria-hidden="true"
        class={cn(
            'grid size-4 place-items-center rounded-full border',
            selected ? 'border-input-accent' : 'border-white/55'
        )}
    >
        {#if selected}
            <span class="leading-none text-input-accent">•</span>
        {/if}
    </span>
{/snippet}

<div
    id="player-settings"
    role="menu"
    aria-label="Playback settings"
    class={cn(
        'absolute right-0 bottom-full z-40 mb-2 overflow-hidden bg-player-panel py-2 text-left text-xs shadow-xl ring-1 ring-white/8',
        player.settingsView.startsWith('segment') ? 'w-64' : 'w-60'
    )}
>
    {#if player.settingsView === 'main'}
        <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={player.media.autoplay}
            class="flex min-h-8 w-full items-center justify-between px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
            onclick={() => player.media.toggleAutoplay()}
        >
            <span>Autoplay</span>
            <span
                aria-hidden="true"
                class={cn(
                    'relative h-3.5 w-7 rounded-full border transition-colors',
                    player.media.autoplay
                        ? 'border-input-accent bg-input-accent/20'
                        : 'border-white/55 bg-white/12'
                )}
            >
                <span
                    class={cn(
                        'absolute top-0.5 left-0.5 size-2 rounded-full transition-all',
                        player.media.autoplay ? 'translate-x-4 bg-input-accent' : 'bg-white'
                    )}
                ></span>
            </span>
        </button>

        <button
            type="button"
            role="menuitem"
            class="flex min-h-8 w-full items-center justify-between px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
            onclick={() => (player.settingsView = 'audio')}
        >
            <span>Audio</span>
            <span class="flex items-center gap-1 text-white/85">
                {audioLabel(player.media.mode)}
                <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
            </span>
        </button>

        <button
            type="button"
            role="menuitem"
            class="flex min-h-8 w-full items-center justify-between px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
            onclick={() => (player.settingsView = 'subtitles')}
        >
            <span>Subtitles/CC</span>
            <span class="flex items-center gap-1 text-white/85">
                {player.media.captions.options.find((option) => option.mode === player.media.captions.mode)
                    ?.label ??
                    player.media.captions.options[0]?.label ??
                    'None'}
                <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
            </span>
        </button>

        {#if player.media.qualities.length > 1}
            <button
                type="button"
                role="menuitem"
                class="flex min-h-8 w-full items-center justify-between px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                onclick={() => (player.settingsView = 'quality')}
            >
                <span>Quality</span>
                <span class="flex items-center gap-1 text-white/85">
                    <span>{player.media.qualityText}</span>
                    {#if isHd(player.media.quality === 'best' ? player.media.bestQuality : player.media.quality)}
                        <span class="font-bold text-accent">HD</span>
                    {/if}
                    <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
                </span>
            </button>
        {/if}

        {#if player.segments.canEdit}
            <button
                type="button"
                role="menuitem"
                class="flex min-h-8 w-full items-center justify-between px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                onclick={() => (player.settingsView = 'segments')}
            >
                <span>Segments</span>
                <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
            </button>
        {/if}
    {:else}
        {@const editingKind =
            player.settingsView === 'segment-opening'
                ? 'opening'
                : player.settingsView === 'segment-ending'
                  ? 'ending'
                  : null}
        <button
            type="button"
            role="menuitem"
            aria-label={player.settingsView === 'subtitle-size'
                ? 'Back to Subtitles/CC'
                : editingKind
                  ? 'Back to segments'
                  : 'Back to playback settings'}
            class="flex min-h-8 w-full items-center gap-2 px-4 text-left text-xs font-bold hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
            onclick={() =>
                (player.settingsView =
                    player.settingsView === 'subtitle-size' ? 'subtitles' : editingKind ? 'segments' : 'main')}
        >
            <CaretLeftIcon size="0.95rem" weight="bold" aria-hidden="true" />
            Back
        </button>

        {#if player.settingsView === 'quality'}
            <button
                type="button"
                role="menuitemradio"
                aria-checked={player.media.quality === 'best'}
                class="flex min-h-8 w-full items-center gap-2 px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                onclick={() => player.media.switchQuality('best')}
            >
                {@render radio(player.media.quality === 'best')}
                Auto
            </button>

            {#each player.media.qualities as option}
                <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={player.media.quality === option}
                    class="flex min-h-8 w-full items-center gap-2 px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                    onclick={() => player.media.switchQuality(option)}
                >
                    {@render radio(player.media.quality === option)}
                    <span>
                        {option}
                        {#if isHd(option)}
                            <span class="font-bold text-accent">HD</span>
                        {/if}
                    </span>
                </button>
            {/each}
        {:else if player.settingsView === 'audio'}
            {#each player.media.audioModes as option}
                <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={player.media.mode === option}
                    class="flex min-h-8 w-full items-center gap-2 px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                    onclick={() => player.media.switchMode(option)}
                >
                    {@render radio(player.media.mode === option)}
                    {audioLabel(option)}
                </button>
            {/each}
        {:else if player.settingsView === 'subtitles'}
            <button
                type="button"
                role="menuitem"
                class="flex min-h-8 w-full items-center justify-between px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                onclick={() => (player.settingsView = 'subtitle-size')}
            >
                <span>Size</span>
                <span class="flex items-center gap-1 text-white/85">
                    {subtitleSizes[player.media.captions.size].label}
                    <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
                </span>
            </button>

            {#each player.media.captions.options as option}
                <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={player.media.captions.mode === option.mode}
                    class="flex min-h-8 w-full items-center gap-2 px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                    onclick={() => player.media.switchSubtitleMode(option.mode)}
                >
                    {@render radio(player.media.captions.mode === option.mode)}
                    {option.label}
                </button>
            {/each}
        {:else if player.settingsView === 'subtitle-size'}
            {#each subtitleSizeOrder as option}
                <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={player.media.captions.size === option}
                    class="flex min-h-8 w-full items-center gap-2 px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                    onclick={() => player.media.captions.switchSize(option)}
                >
                    {@render radio(player.media.captions.size === option)}
                    {subtitleSizes[option].label}
                </button>
            {/each}
        {:else if player.settingsView === 'segments'}
            {#each ['opening', 'ending'] satisfies SkipKind[] as kind (kind)}
                {@const interval = player.segments.draft[kind]}
                <button
                    type="button"
                    role="menuitem"
                    class="flex min-h-11 w-full items-center gap-3 px-4 text-left hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                    onclick={() =>
                        (player.settingsView = kind === 'opening' ? 'segment-opening' : 'segment-ending')}
                >
                    <span class="font-medium">{skipLabels[kind]}</span>
                    <span class="ml-auto text-[0.7rem] text-white/60 tabular-nums">
                        {interval.start === null || interval.end === null
                            ? 'Not set'
                            : `${formatTime(interval.start)} – ${formatTime(interval.end)}`}
                    </span>
                    <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
                </button>
            {/each}
        {:else if editingKind}
            {@const template = player.segments.templates[editingKind]}
            {#each ['start', 'end'] satisfies Array<'start' | 'end'> as edge (edge)}
                {@const edgeTime = player.segments.draft[editingKind][edge]}
                <button
                    type="button"
                    role="menuitem"
                    aria-label={`Set ${skipLabels[editingKind].toLowerCase()} ${edge} to current playback position`}
                    title="Set to current playback position"
                    disabled={player.segments.saving}
                    class="flex min-h-11 w-full items-center gap-3 px-4 text-left hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none disabled:opacity-40"
                    onclick={() => player.segments.mark(editingKind, edge, player.media.video.currentTime)}
                >
                    <span class="font-medium capitalize">{edge}</span>
                    <span class="ml-auto text-white/65 tabular-nums">
                        {edgeTime === null ? 'Not set' : formatTime(edgeTime)}
                    </span>
                    <span class="font-semibold text-input-accent">Set here</span>
                </button>
            {/each}

            {#if Number.isSafeInteger(player.segments.episodeNumber) && player.segments.episodeNumber > 0}
                <button
                    type="button"
                    role="menuitem"
                    disabled={player.segments.saving}
                    class="flex min-h-9 w-full items-center px-4 text-left font-semibold text-input-accent hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none disabled:opacity-40"
                    onclick={() =>
                        player.segments.creatingTemplate === editingKind
                            ? player.segments.cancelTemplate(editingKind)
                            : player.segments.startTemplate(editingKind)}
                >
                    {player.segments.creatingTemplate === editingKind
                        ? 'Cancel new template'
                        : template
                          ? `New ${skipLabels[editingKind].toLowerCase()}`
                          : 'Start new template'}
                </button>
            {/if}

            {#if player.segments.draft[editingKind].start !== null || player.segments.draft[editingKind].end !== null}
                <button
                    type="button"
                    role="menuitem"
                    disabled={player.segments.saving}
                    class="flex min-h-9 w-full items-center px-4 text-left text-white/55 hover:bg-white/8 hover:text-white focus-visible:bg-white/8 focus-visible:text-white focus-visible:outline-none disabled:opacity-40"
                    onclick={() => player.segments.clear(editingKind)}
                >
                    Clear segment
                </button>
            {/if}

            {#if player.segments.saving}
                <p aria-live="polite" class="border-t border-white/8 px-4 py-2 text-[0.7rem] text-white/60">
                    Saving…
                </p>
            {/if}

            {#if player.segments.error}
                <p role="alert" class="border-t border-white/8 px-4 py-2.5 text-[0.7rem] leading-4 text-red-300">
                    {player.segments.error}
                </p>
            {/if}
        {/if}
    {/if}
</div>
