<script lang="ts">
    import { onMount } from 'svelte';
    import { CaretDownIcon } from 'phosphor-svelte';

    import ccBackground from '$lib/assets/cc-background.png';
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
    } from '$lib/player/subtitle-settings.svelte';
    import * as preferences from '$lib/player/preferences';
    import { cn } from '$lib/utils';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import { m } from '$lib/i18n.svelte';

    let size = $state<SubtitleSize>('normal');
    let textColor = $state<SubtitleTextColor>('white');
    let background = $state<SubtitleBackground>('black');
    let backgroundOpacity = $state<SubtitleBackgroundOpacity>(0.75);
    let edgeStyle = $state<SubtitleEdgeStyle>('outline');

    const textColorOptions = ['white', 'yellow', 'black'] as const satisfies readonly SubtitleTextColor[];
    const backgroundOptions = ['black', 'white', 'none'] as const satisfies readonly SubtitleBackground[];
    const edgeStyleOptions = ['outline', 'none'] as const satisfies readonly SubtitleEdgeStyle[];

    onMount(() => {
        const saved = preferences.load({}, []);
        size = saved.subtitleSize ?? size;
        textColor = saved.subtitleTextColor ?? textColor;
        background = saved.subtitleBackground ?? background;
        backgroundOpacity = saved.subtitleBackgroundOpacity ?? backgroundOpacity;
        edgeStyle = saved.subtitleEdgeStyle ?? edgeStyle;
    });

    function resetDefaults() {
        size = 'normal';
        textColor = 'white';
        background = 'black';
        backgroundOpacity = 0.75;
        edgeStyle = 'outline';
        preferences.save('subtitle-size', size);
        preferences.save('subtitle-text-color', textColor);
        preferences.save('subtitle-background', background);
        preferences.save('subtitle-background-opacity', backgroundOpacity);
        preferences.save('subtitle-edge-style', edgeStyle);
    }
</script>

<svelte:head>
    <title>Arc — {m.settings_subtitles()}</title>
    <meta name="description" content={m.settings_subtitles_synopsis()} />
</svelte:head>

<div class="space-y-8 sm:space-y-10">
    <section aria-labelledby="subtitle-preview-title">
        <h2 id="subtitle-preview-title" class="text-lg font-medium">{m.settings_preview()}</h2>
        <div
            class="relative mt-5 aspect-[16/9] min-h-48 overflow-hidden bg-black bg-cover bg-center ring-1 ring-border/50 sm:aspect-[16/7]"
            style:background-image={`url(${ccBackground})`}
        >
            <div class="absolute inset-0 flex items-end justify-center p-4 sm:p-8">
                <p
                    class={cn(
                        'max-w-full break-words px-2 py-1 text-center leading-tight font-semibold',
                        edgeStyle === 'outline' && 'subtitle-outline'
                    )}
                    style:color={subtitleTextColors[textColor].value}
                    style:font-size={`${subtitleSizes[size].px}px`}
                    style:background-color={subtitleBackgrounds[background].value === null
                        ? 'transparent'
                        : `rgb(${subtitleBackgrounds[background].value} / ${backgroundOpacity})`}
                >
                    {m.settings_closed_captions()}
                </p>
            </div>
        </div>
    </section>

    <section aria-labelledby="subtitle-text-title">
        <h2 id="subtitle-text-title" class="text-lg font-medium">{m.settings_text()}</h2>
        <div class="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div class="text-sm">
                <span class="text-xs text-muted">{m.player_size()}</span>
                <Dropdown
                    id="subtitle-size"
                    menuAlign="start"
                    triggerClass="mt-2 inline-flex min-h-10 w-56 max-w-full cursor-pointer items-center justify-between border border-border-strong bg-transparent px-4 text-sm text-muted transition-colors hover:border-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[state=open]:border-accent data-[state=open]:text-foreground"
                >
                    {#snippet trigger()}<span>{subtitleSizes[size].label}</span>
                        <CaretDownIcon size={16} aria-hidden="true" />{/snippet}
                    {#snippet content()}
                        {#each subtitleSizeOrder as option}
                            <button
                                type="button"
                                class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                onclick={() => {
                                    size = option;
                                    preferences.save('subtitle-size', size);
                                }}
                            >
                                {subtitleSizes[option].label}
                            </button>
                        {/each}
                    {/snippet}
                </Dropdown>
            </div>

            <div class="text-sm">
                <span class="text-xs text-muted">{m.settings_color()}</span>
                <Dropdown
                    id="subtitle-text-color"
                    menuAlign="start"
                    triggerClass="mt-2 inline-flex min-h-10 w-56 max-w-full cursor-pointer items-center justify-between border border-border-strong bg-transparent px-4 text-sm text-muted transition-colors hover:border-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[state=open]:border-accent data-[state=open]:text-foreground"
                >
                    {#snippet trigger()}<span>{subtitleTextColors[textColor].label}</span>
                        <CaretDownIcon size={16} aria-hidden="true" />{/snippet}
                    {#snippet content()}
                        {#each textColorOptions as option}<button
                                type="button"
                                class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                onclick={() => {
                                    textColor = option;
                                    preferences.save('subtitle-text-color', textColor);
                                }}
                            >
                                {subtitleTextColors[option].label}
                            </button>{/each}
                    {/snippet}
                </Dropdown>
            </div>

            <div class="text-sm">
                <span class="text-xs text-muted">{m.settings_edge_style()}</span>
                <Dropdown
                    id="subtitle-edge-style"
                    menuAlign="start"
                    triggerClass="mt-2 inline-flex min-h-10 w-56 max-w-full cursor-pointer items-center justify-between border border-border-strong bg-transparent px-4 text-sm text-muted transition-colors hover:border-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[state=open]:border-accent data-[state=open]:text-foreground"
                >
                    {#snippet trigger()}<span>{subtitleEdgeStyles[edgeStyle].label}</span>
                        <CaretDownIcon size={16} aria-hidden="true" />{/snippet}
                    {#snippet content()}
                        {#each edgeStyleOptions as option}<button
                                type="button"
                                class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                onclick={() => {
                                    edgeStyle = option;
                                    preferences.save('subtitle-edge-style', edgeStyle);
                                }}
                            >
                                {subtitleEdgeStyles[option].label}
                            </button>{/each}
                    {/snippet}
                </Dropdown>
            </div>
        </div>
    </section>

    <section aria-labelledby="subtitle-background-title">
        <h2 id="subtitle-background-title" class="text-lg font-medium">{m.settings_background()}</h2>
        <div class="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div class="text-sm">
                <span class="text-xs text-muted">{m.settings_color()}</span>
                <Dropdown
                    id="subtitle-background"
                    menuAlign="start"
                    triggerClass="mt-2 inline-flex min-h-10 w-56 max-w-full cursor-pointer items-center justify-between border border-border-strong bg-transparent px-4 text-sm text-muted transition-colors hover:border-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[state=open]:border-accent data-[state=open]:text-foreground"
                >
                    {#snippet trigger()}<span>{subtitleBackgrounds[background].label}</span>
                        <CaretDownIcon size={16} aria-hidden="true" />{/snippet}
                    {#snippet content()}
                        {#each backgroundOptions as option}<button
                                type="button"
                                class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                onclick={() => {
                                    background = option;
                                    preferences.save('subtitle-background', background);
                                }}
                            >
                                {subtitleBackgrounds[option].label}
                            </button>{/each}
                    {/snippet}
                </Dropdown>
            </div>

            <div class="text-sm">
                <span class="text-xs text-muted">{m.settings_opacity()}</span>
                <Dropdown
                    id="subtitle-background-opacity"
                    disabled={background === 'none'}
                    menuAlign="start"
                    triggerClass="mt-2 inline-flex min-h-10 w-56 max-w-full cursor-pointer items-center justify-between border border-border-strong bg-transparent px-4 text-sm text-muted transition-colors hover:border-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[state=open]:border-accent data-[state=open]:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {#snippet trigger()}<span>{Math.round(backgroundOpacity * 100)}%</span>
                        <CaretDownIcon size={16} aria-hidden="true" />{/snippet}
                    {#snippet content()}
                        {#each subtitleBackgroundOpacities as option}<button
                                type="button"
                                class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                onclick={() => {
                                    backgroundOpacity = option;
                                    preferences.save('subtitle-background-opacity', backgroundOpacity);
                                }}
                            >
                                {Math.round(option * 100)}%
                            </button>{/each}
                    {/snippet}
                </Dropdown>
            </div>
        </div>
    </section>

    <div class="pt-6">
        <button
            type="button"
            class="min-h-10 w-full border border-border-strong px-4 text-xs font-bold text-muted uppercase transition-[border-color,color,transform] duration-150 hover:border-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97] sm:w-auto"
            onclick={resetDefaults}
        >
            {m.settings_reset()}
        </button>
    </div>
</div>
