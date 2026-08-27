<script lang="ts">
    import { onMount } from 'svelte';

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
    } from '$lib/player/media';
    import * as preferences from '$lib/player/preferences';
    import { cn } from '$lib/utils';
    import { m } from '$lib/paraglide/messages.js';

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
            <label class="block text-sm">
                <span class="text-xs text-muted">{m.player_size()}</span>
                <select
                    bind:value={size}
                    class="mt-2 min-h-11 w-full border-b border-border-strong bg-panel px-1 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none"
                    onchange={() => preferences.save('subtitle-size', size)}
                >
                    {#each subtitleSizeOrder as option}
                        <option value={option}>{subtitleSizes[option].label}</option>
                    {/each}
                </select>
            </label>

            <label class="block text-sm">
                <span class="text-xs text-muted">{m.settings_color()}</span>
                <select
                    bind:value={textColor}
                    class="mt-2 min-h-11 w-full border-b border-border-strong bg-panel px-1 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none"
                    onchange={() => preferences.save('subtitle-text-color', textColor)}
                >
                    {#each textColorOptions as option}
                        <option value={option}>{subtitleTextColors[option].label}</option>
                    {/each}
                </select>
            </label>

            <label class="block text-sm">
                <span class="text-xs text-muted">{m.settings_edge_style()}</span>
                <select
                    bind:value={edgeStyle}
                    class="mt-2 min-h-11 w-full border-b border-border-strong bg-panel px-1 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none"
                    onchange={() => preferences.save('subtitle-edge-style', edgeStyle)}
                >
                    {#each edgeStyleOptions as option}
                        <option value={option}>{subtitleEdgeStyles[option].label}</option>
                    {/each}
                </select>
            </label>
        </div>
    </section>

    <section aria-labelledby="subtitle-background-title">
        <h2 id="subtitle-background-title" class="text-lg font-medium">{m.settings_background()}</h2>
        <div class="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <label class="block text-sm">
                <span class="text-xs text-muted">{m.settings_color()}</span>
                <select
                    bind:value={background}
                    class="mt-2 min-h-11 w-full border-b border-border-strong bg-panel px-1 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none"
                    onchange={() => preferences.save('subtitle-background', background)}
                >
                    {#each backgroundOptions as option}
                        <option value={option}>{subtitleBackgrounds[option].label}</option>
                    {/each}
                </select>
            </label>

            <label class="block text-sm">
                <span class="text-xs text-muted">{m.settings_opacity()}</span>
                <select
                    bind:value={backgroundOpacity}
                    disabled={background === 'none'}
                    class="mt-2 min-h-11 w-full border-b border-border-strong bg-panel px-1 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-accent focus-visible:outline-none"
                    onchange={() => preferences.save('subtitle-background-opacity', backgroundOpacity)}
                >
                    {#each subtitleBackgroundOpacities as option}
                        <option value={option}>{Math.round(option * 100)}%</option>
                    {/each}
                </select>
            </label>
        </div>
    </section>

    <div class="border-t border-border pt-6">
        <button
            type="button"
            class="min-h-10 w-full border border-border-strong px-4 text-xs font-bold text-muted uppercase transition-[border-color,color,transform] duration-150 hover:border-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97] sm:w-auto"
            onclick={resetDefaults}
        >
            {m.settings_reset()}
        </button>
    </div>
</div>
