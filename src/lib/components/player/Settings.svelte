<script lang="ts">
    import type { AudioMode } from '$lib/anime/audio';
    import {
        audioLabel,
        formatTime,
        isHd,
        subtitleSizeOrder,
        subtitleSizes,
        type SettingsView,
        type SubtitleMode,
        type SubtitleOption,
        type SubtitleSize,
    } from '$lib/player/media';
    import type { SegmentTemplates, SkipKind, SkipTimesDraft } from '$lib/player/skip-times';
    import { cn } from '$lib/utils';
    import { CaretLeftIcon, CaretRightIcon } from 'phosphor-svelte';

    interface Props {
        audioModes: AudioMode[];
        autoplay: boolean;
        bestQuality: string | null;
        creatingTemplate: SkipKind | null;
        episodeNumber: number;
        mode: AudioMode;
        onautoplay: () => void;
        onmode: (mode: AudioMode) => void;
        onquality: (quality: string) => void;
        onskipclear: (kind: SkipKind) => void;
        onskipmark: (kind: SkipKind, edge: 'start' | 'end') => void;
        onskiptemplatecancel: (kind: SkipKind) => void;
        onskiptemplatenew: (kind: SkipKind) => void;
        qualities: string[];
        quality: string;
        qualityText: string;
        skipDraft: SkipTimesDraft;
        skipError: string | null;
        skipSaving: boolean;
        segments: {
            canEdit: boolean;
            templates: SegmentTemplates;
        };
        subtitleMode: SubtitleMode;
        subtitleOptions: SubtitleOption[];
        subtitleSize: SubtitleSize;
        onsubtitlemode: (mode: SubtitleMode) => void;
        onsubtitlesize: (size: SubtitleSize) => void;
        view?: SettingsView;
    }

    let {
        audioModes,
        autoplay,
        bestQuality,
        creatingTemplate,
        episodeNumber,
        mode,
        onautoplay,
        onmode,
        onquality,
        onskipclear,
        onskipmark,
        onskiptemplatecancel,
        onskiptemplatenew,
        qualities,
        quality,
        qualityText,
        skipDraft,
        skipError,
        skipSaving,
        segments,
        subtitleMode,
        subtitleOptions,
        subtitleSize,
        onsubtitlemode,
        onsubtitlesize,
        view = $bindable('main'),
    }: Props = $props();

    const skipKinds: SkipKind[] = ['opening', 'ending'];
    const skipEdges = ['start', 'end'] as const;

    // The main menu shows the active caption choice (English CC, Original,
    // Signs & Songs, or None).
    let subtitleLanguageLabel = $derived(
        subtitleOptions.find((option) => option.mode === subtitleMode)?.label ??
            subtitleOptions[0]?.label ??
            'None'
    );

    function skipLabel(kind: SkipKind) {
        return kind === 'opening' ? 'Opening' : 'Ending';
    }

    function skipRange(kind: SkipKind) {
        const { start, end } = skipDraft[kind];
        if (start === null || end === null) {
            return 'Not set';
        }

        return `${formatTime(start)} – ${formatTime(end)}`;
    }

    function skipEdgeTime(kind: SkipKind, edge: (typeof skipEdges)[number]) {
        const value = skipDraft[kind][edge];
        return value === null ? 'Not set' : formatTime(value);
    }

    function openSkip(kind: SkipKind) {
        view = kind === 'opening' ? 'segment-opening' : 'segment-ending';
    }
</script>

{#snippet radio(selected: boolean)}
    <span
        aria-hidden="true"
        class={cn(
            'grid size-4 place-items-center rounded-full border',
            selected ? 'border-player-accent' : 'border-white/55'
        )}
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
    class={cn(
        'absolute right-0 bottom-full z-40 mb-2 overflow-hidden bg-player-panel py-2 text-left text-xs shadow-xl ring-1 ring-white/8',
        view.startsWith('segment') ? 'w-64' : 'w-60'
    )}
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
                class={cn(
                    'relative h-3.5 w-7 rounded-full border transition-colors',
                    autoplay
                        ? 'border-player-accent bg-player-accent/20'
                        : 'border-white/55 bg-white/12'
                )}
            >
                <span
                    class={cn(
                        'absolute top-0.5 left-0.5 size-2 rounded-full transition-all',
                        autoplay ? 'translate-x-4 bg-player-accent' : 'bg-white'
                    )}
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
            onclick={() => (view = 'subtitles')}
        >
            <span>Subtitles/CC</span>
            <span class="flex items-center gap-1 text-white/85">
                {subtitleLanguageLabel}
                <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
            </span>
        </button>

        {#if qualities.length > 1}
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
        {/if}

        {#if segments.canEdit}
            <button
                type="button"
                role="menuitem"
                class="flex min-h-8 w-full items-center justify-between px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                onclick={() => (view = 'segments')}
            >
                <span>Segments</span>
                <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
            </button>
        {/if}
    {:else}
        {@const editingKind =
            view === 'segment-opening' ? 'opening' : view === 'segment-ending' ? 'ending' : null}
        {@const subtitleOption = view === 'subtitle-size' ? 'Size' : null}
        <button
            type="button"
            role="menuitem"
            aria-label={editingKind
                ? 'Back to segments'
                : subtitleOption
                  ? 'Back to Subtitles/CC'
                  : 'Back to playback settings'}
            class="flex min-h-8 w-full items-center gap-2 px-4 text-left text-xs font-bold hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
            onclick={() =>
                (view = editingKind ? 'segments' : subtitleOption ? 'subtitles' : 'main')}
        >
            <CaretLeftIcon size="0.95rem" weight="bold" aria-hidden="true" />
            {view === 'quality'
                ? 'Quality'
                : view === 'audio'
                  ? 'Audio'
                  : view === 'subtitles'
                    ? 'Subtitles/CC'
                    : editingKind
                      ? skipLabel(editingKind)
                      : subtitleOption
                        ? subtitleOption
                        : 'Segments'}
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
        {:else if view === 'audio'}
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
        {:else if view === 'subtitles'}
            <button
                type="button"
                role="menuitem"
                class="flex min-h-8 w-full items-center justify-between px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                onclick={() => (view = 'subtitle-size')}
            >
                <span>Size</span>
                <span class="flex items-center gap-1 text-white/85">
                    {subtitleSizes[subtitleSize].label}
                    <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
                </span>
            </button>

            {#each subtitleOptions as option}
                <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={subtitleMode === option.mode}
                    class="flex min-h-8 w-full items-center gap-2 px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                    onclick={() => onsubtitlemode(option.mode)}
                >
                    {@render radio(subtitleMode === option.mode)}
                    {option.label}
                </button>
            {/each}
        {:else if view === 'subtitle-size'}
            {#each subtitleSizeOrder as size}
                <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={subtitleSize === size}
                    class="flex min-h-8 w-full items-center gap-2 px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                    onclick={() => onsubtitlesize(size)}
                >
                    {@render radio(subtitleSize === size)}
                    {subtitleSizes[size].label}
                </button>
            {/each}
        {:else if view === 'segments'}
            {#each skipKinds as kind}
                <button
                    type="button"
                    role="menuitem"
                    class="flex min-h-11 w-full items-center gap-3 px-4 text-left hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                    onclick={() => openSkip(kind)}
                >
                    <span class="font-medium">{skipLabel(kind)}</span>
                    <span class="ml-auto text-[0.7rem] text-white/60 tabular-nums">
                        {skipRange(kind)}
                    </span>
                    <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
                </button>
            {/each}
        {:else if editingKind}
            {@const template = segments.templates[editingKind]}
            {#each skipEdges as edge}
                <button
                    type="button"
                    role="menuitem"
                    aria-label={`Set ${skipLabel(editingKind).toLowerCase()} ${edge} to current playback position`}
                    title="Set to current playback position"
                    disabled={skipSaving}
                    class="flex min-h-11 w-full items-center gap-3 px-4 text-left hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none disabled:opacity-40"
                    onclick={() => onskipmark(editingKind, edge)}
                >
                    <span class="font-medium capitalize">{edge}</span>
                    <span class="ml-auto text-white/65 tabular-nums">
                        {skipEdgeTime(editingKind, edge)}
                    </span>
                    <span class="font-semibold text-player-accent">Set here</span>
                </button>
            {/each}

            {#if Number.isSafeInteger(episodeNumber) && episodeNumber > 0}
                <button
                    type="button"
                    role="menuitem"
                    disabled={skipSaving}
                    class="flex min-h-9 w-full items-center px-4 text-left font-semibold text-player-accent hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none disabled:opacity-40"
                    onclick={() =>
                        creatingTemplate === editingKind
                            ? onskiptemplatecancel(editingKind)
                            : onskiptemplatenew(editingKind)}
                >
                    {creatingTemplate === editingKind
                        ? 'Cancel new template'
                        : template
                          ? `New ${skipLabel(editingKind).toLowerCase()}`
                          : 'Start new template'}
                </button>
            {/if}

            {#if skipDraft[editingKind].start !== null || skipDraft[editingKind].end !== null}
                <button
                    type="button"
                    role="menuitem"
                    disabled={skipSaving}
                    class="flex min-h-9 w-full items-center px-4 text-left text-white/55 hover:bg-white/8 hover:text-white focus-visible:bg-white/8 focus-visible:text-white focus-visible:outline-none disabled:opacity-40"
                    onclick={() => onskipclear(editingKind)}
                >
                    Clear segment
                </button>
            {/if}

            {#if skipSaving}
                <p
                    aria-live="polite"
                    class="border-t border-white/8 px-4 py-2 text-[0.7rem] text-white/60"
                >
                    Saving…
                </p>
            {/if}

            {#if skipError}
                <p
                    role="alert"
                    class="border-t border-white/8 px-4 py-2.5 text-[0.7rem] leading-4 text-red-300"
                >
                    {skipError}
                </p>
            {/if}
        {/if}
    {/if}
</div>
