<script lang="ts">
    import { onMount } from 'svelte';
    import ccBackground from '$lib/assets/cc-background.png';
    import Dropdown from '$lib/components/Dropdown.svelte';
    import {
        subtitleBackgroundOpacities,
        subtitleBackgrounds,
        subtitleEdgeStyles,
        subtitleSizeOrder,
        subtitleSizes,
        subtitleTextColors,
        type SubtitleBackground,
        type SubtitleBackgroundOpacity,
        type SubtitleEdgeStyle,
        type SubtitleSize,
        type SubtitleTextColor,
    } from '$lib/player/media';
    import * as preferences from '$lib/player/preferences';
    import { CaretDownIcon } from 'phosphor-svelte';

    let size = $state<SubtitleSize>('normal');
    let textColor = $state<SubtitleTextColor>('white');
    let background = $state<SubtitleBackground>('black');
    let backgroundOpacity = $state<SubtitleBackgroundOpacity>(0.75);
    let edgeStyle = $state<SubtitleEdgeStyle>('outline');

    onMount(() => {
        const saved = preferences.load({}, []);
        size = saved.subtitleSize ?? size;
        textColor = saved.subtitleTextColor ?? textColor;
        background = saved.subtitleBackground ?? background;
        backgroundOpacity = saved.subtitleBackgroundOpacity ?? backgroundOpacity;
        edgeStyle = saved.subtitleEdgeStyle ?? edgeStyle;
    });

    function saveSize(value: SubtitleSize) {
        size = value;
        preferences.save('subtitle-size', value);
    }

    function saveTextColor(value: SubtitleTextColor) {
        textColor = value;
        preferences.save('subtitle-text-color', value);
    }

    function saveBackground(value: SubtitleBackground) {
        background = value;
        preferences.save('subtitle-background', value);
    }

    function saveBackgroundOpacity(value: SubtitleBackgroundOpacity) {
        backgroundOpacity = value;
        preferences.save('subtitle-background-opacity', value);
    }

    function saveEdgeStyle(value: SubtitleEdgeStyle) {
        edgeStyle = value;
        preferences.save('subtitle-edge-style', value);
    }

    function resetDefaults() {
        saveSize('normal');
        saveTextColor('white');
        saveBackground('black');
        saveBackgroundOpacity(0.75);
        saveEdgeStyle('outline');
    }

    const textColorOptions = ['white', 'yellow', 'black'] as const satisfies readonly SubtitleTextColor[];
    const backgroundOptions = ['black', 'white', 'none'] as const satisfies readonly SubtitleBackground[];
    const edgeStyleOptions = ['outline', 'none'] as const satisfies readonly SubtitleEdgeStyle[];
</script>

<div class="space-y-10">
    <section aria-labelledby="subtitle-preview-title">
        <div class="flex items-end justify-between gap-4">
            <div>
                <h2 id="subtitle-preview-title" class="text-lg font-medium">Preview</h2>
            </div>
        </div>

        <div
            class="relative mt-5 aspect-[16/7] min-h-48 overflow-hidden bg-black bg-cover bg-center ring-1 ring-border/50"
            style:background-image={`url(${ccBackground})`}
        >
            <div class="absolute inset-0 flex items-end justify-center p-4 sm:p-8">
                <p
                    class="max-w-full px-2 py-1 text-center leading-tight font-semibold"
                    class:subtitle-outline={edgeStyle === 'outline'}
                    style:color={subtitleTextColors[textColor].value}
                    style:font-size={`${subtitleSizes[size].px}px`}
                    style:background-color={subtitleBackgrounds[background].value === null
                        ? 'transparent'
                        : `rgb(${subtitleBackgrounds[background].value} / ${backgroundOpacity})`}
                >
                    Closed Captions will look like this.
                </p>
            </div>
        </div>
    </section>

    <section aria-labelledby="text-settings-title">
        <h2 id="text-settings-title" class="text-lg font-medium">Text</h2>
        <div class="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div>
                <span class="text-xs text-muted">Font</span>
                <div class="mt-2 min-h-10 border-b border-border-strong pb-2 text-sm text-muted">Default</div>
            </div>
            <label class="block text-sm">
                <span class="text-xs text-muted">Size</span>
                <Dropdown
                    id="subtitle-size"
                    ariaLabel="Subtitle size"
                    menuAlign="start"
                    menuClass="mt-1 w-full min-w-40 shadow-xl"
                    triggerClass="mt-2 flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 border-b border-border-strong bg-transparent px-0 pb-2 text-sm text-foreground transition-colors hover:border-accent hover:text-accent peer-checked:border-accent peer-checked:text-accent"
                >
                    {#snippet trigger()}
                        <span>{subtitleSizes[size].label}</span>
                        <CaretDownIcon size="0.9rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                    {#snippet content()}
                        {#each subtitleSizeOrder as option}
                            <button
                                type="button"
                                class="block w-full px-3 py-2.5 text-left text-sm text-muted hover:bg-panel-hover focus:bg-panel-hover focus:outline-none"
                                class:text-white={size === option}
                                onclick={() => saveSize(option)}
                            >
                                {subtitleSizes[option].label}
                            </button>
                        {/each}
                    {/snippet}
                </Dropdown>
            </label>
            <label class="block text-sm">
                <span class="text-xs text-muted">Color</span>
                <Dropdown
                    id="subtitle-text-color"
                    ariaLabel="Subtitle text color"
                    menuAlign="start"
                    menuClass="mt-1 w-full min-w-40 shadow-xl"
                    triggerClass="mt-2 flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 border-b border-border-strong bg-transparent px-0 pb-2 text-sm text-foreground transition-colors hover:border-accent hover:text-accent peer-checked:border-accent peer-checked:text-accent"
                >
                    {#snippet trigger()}
                        <span>{subtitleTextColors[textColor].label}</span>
                        <CaretDownIcon size="0.9rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                    {#snippet content()}
                        {#each textColorOptions as option}
                            <button
                                type="button"
                                class="block w-full px-3 py-2.5 text-left text-sm text-muted hover:bg-panel-hover focus:bg-panel-hover focus:outline-none"
                                class:text-white={textColor === option}
                                onclick={() => saveTextColor(option)}
                            >
                                {subtitleTextColors[option].label}
                            </button>
                        {/each}
                    {/snippet}
                </Dropdown>
            </label>
            <div>
                <span class="text-xs text-muted">Edge style</span>
                <Dropdown
                    id="subtitle-edge-style"
                    ariaLabel="Subtitle edge style"
                    menuAlign="start"
                    menuClass="mt-1 w-full min-w-40 shadow-xl"
                    triggerClass="mt-2 flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 border-b border-border-strong bg-transparent px-0 pb-2 text-sm text-foreground transition-colors hover:border-accent hover:text-accent peer-checked:border-accent peer-checked:text-accent"
                >
                    {#snippet trigger()}
                        <span>{subtitleEdgeStyles[edgeStyle].label}</span>
                        <CaretDownIcon size="0.9rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                    {#snippet content()}
                        {#each edgeStyleOptions as option}
                            <button
                                type="button"
                                class="block w-full px-3 py-2.5 text-left text-sm text-muted hover:bg-panel-hover focus:bg-panel-hover focus:outline-none"
                                class:text-white={edgeStyle === option}
                                onclick={() => saveEdgeStyle(option)}
                            >
                                {subtitleEdgeStyles[option].label}
                            </button>
                        {/each}
                    {/snippet}
                </Dropdown>
            </div>
        </div>
    </section>

    <section aria-labelledby="background-settings-title">
        <h2 id="background-settings-title" class="text-lg font-medium">Background</h2>
        <div class="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <label class="block text-sm">
                <span class="text-xs text-muted">Color</span>
                <Dropdown
                    id="subtitle-background"
                    ariaLabel="Subtitle background color"
                    menuAlign="start"
                    menuClass="mt-1 w-full min-w-40 shadow-xl"
                    triggerClass="mt-2 flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 border-b border-border-strong bg-transparent px-0 pb-2 text-sm text-foreground transition-colors hover:border-accent hover:text-accent peer-checked:border-accent peer-checked:text-accent"
                >
                    {#snippet trigger()}
                        <span>{subtitleBackgrounds[background].label}</span>
                        <CaretDownIcon size="0.9rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                    {#snippet content()}
                        {#each backgroundOptions as option}
                            <button
                                type="button"
                                class="block w-full px-3 py-2.5 text-left text-sm text-muted hover:bg-panel-hover focus:bg-panel-hover focus:outline-none"
                                class:text-white={background === option}
                                onclick={() => saveBackground(option)}
                            >
                                {subtitleBackgrounds[option].label}
                            </button>
                        {/each}
                    {/snippet}
                </Dropdown>
            </label>
            <label class="block text-sm">
                <span class="text-xs text-muted">Opacity</span>
                <Dropdown
                    id="subtitle-background-opacity"
                    ariaLabel="Subtitle background opacity"
                    menuAlign="start"
                    menuClass="mt-1 w-full min-w-40 shadow-xl"
                    triggerClass="mt-2 flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 border-b border-border-strong bg-transparent px-0 pb-2 text-sm text-foreground transition-colors hover:border-accent hover:text-accent peer-checked:border-accent peer-checked:text-accent"
                >
                    {#snippet trigger()}
                        <span>{Math.round(backgroundOpacity * 100)}%</span>
                        <CaretDownIcon size="0.9rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                    {#snippet content()}
                        {#each subtitleBackgroundOpacities as option}
                            <button
                                type="button"
                                class="block w-full px-3 py-2.5 text-left text-sm text-muted hover:bg-panel-hover focus:bg-panel-hover focus:outline-none"
                                class:text-white={backgroundOpacity === option}
                                onclick={() => saveBackgroundOpacity(option)}
                            >
                                {Math.round(option * 100)}%
                            </button>
                        {/each}
                    {/snippet}
                </Dropdown>
            </label>
        </div>
    </section>

    <div class="flex justify-end border-t border-border pt-6">
        <button
            type="button"
            class="min-h-9 border border-border-strong px-4 text-xs font-bold text-muted uppercase transition-colors hover:border-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onclick={resetDefaults}
        >
            Reset to default
        </button>
    </div>
</div>
