<script lang="ts">
    import { onMount } from 'svelte';
    import { CaretDownIcon } from 'phosphor-svelte';

    import ccBackground from '$lib/assets/cc-background.webp';
    import {
        subtitleBackgroundOpacities,
        subtitleBackgroundOrder,
        subtitleBackgrounds,
        subtitleEdgeStyleOrder,
        subtitleEdgeStyles,
        subtitleSizeOrder,
        subtitleSizes,
        subtitleTextColorOrder,
        subtitleTextColors,
        SubtitleSettings,
    } from '$lib/player/subtitle-settings.svelte';
    import { cn } from '$lib/utils';
    import Button from '$lib/components/ui/button/button.svelte';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import { m } from '$lib/i18n.svelte';

    const settings = new SubtitleSettings();

    onMount(() => settings.load());
</script>

<svelte:head>
    <title>Arc — {m.settings_subtitles()}</title>
    <meta name="description" content={m.settings_subtitles_synopsis()} />
</svelte:head>

<div class="space-y-8 sm:space-y-10">
    <section aria-labelledby="subtitle-preview-title">
        <h2 id="subtitle-preview-title" class="text-lg font-medium">{m.settings_preview()}</h2>
        <div
            class="relative mt-5 aspect-video min-h-48 overflow-hidden bg-black bg-cover bg-center ring-1 ring-border/50 sm:aspect-16/7"
            style:background-image={`url(${ccBackground})`}
        >
            <div class="absolute inset-0 flex items-end justify-center p-4 sm:p-8">
                <p
                    class={cn(
                        'max-w-full px-2 py-1 text-center leading-tight font-semibold',
                        settings.edgeStyle === 'outline' && 'subtitle-outline'
                    )}
                    style:color={subtitleTextColors[settings.textColor].value}
                    style:font-size={`${subtitleSizes[settings.size].px}px`}
                    style:background-color={subtitleBackgrounds[settings.background].value === null
                        ? 'transparent'
                        : `rgb(${subtitleBackgrounds[settings.background].value} / ${settings.backgroundOpacity})`}
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
                <Dropdown id="subtitle-size">
                    {#snippet trigger(triggerProps)}
                        <Button
                            {...triggerProps}
                            variant="unstyled"
                            aria-label={m.player_size()}
                            class="appearance-none p-0 mt-2 inline-flex min-h-11 w-full max-w-full cursor-pointer items-center justify-between border-0 border-b border-border-strong bg-transparent px-0 text-base font-semibold text-white transition-colors hover:border-input-accent hover:text-input-accent focus-visible:border-input-accent focus-visible:text-input-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent data-[state=open]:border-input-accent data-[state=open]:text-input-accent"
                        >
                            <span>{subtitleSizes[settings.size].label}</span>
                            <CaretDownIcon size={16} aria-hidden="true"></CaretDownIcon>
                        </Button>
                    {/snippet}
                    {#snippet content(menuProps)}
                        <div
                            {...menuProps}
                            role="menu"
                            aria-label={m.player_size()}
                            class="absolute top-full left-0 z-50 mt-2 w-48 bg-panel"
                        >
                            {#each subtitleSizeOrder as option}
                                <Button
                                    variant="unstyled"
                                    type="button"
                                    class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    onclick={() => {
                                        settings.setSize(option);
                                    }}
                                >
                                    {subtitleSizes[option].label}
                                </Button>
                            {/each}
                        </div>
                    {/snippet}
                </Dropdown>
            </div>

            <div class="text-sm">
                <span class="text-xs text-muted">{m.settings_color()}</span>
                <Dropdown id="subtitle-text-color">
                    {#snippet trigger(triggerProps)}
                        <Button
                            {...triggerProps}
                            variant="unstyled"
                            aria-label={m.settings_color()}
                            class="appearance-none p-0 mt-2 inline-flex min-h-11 w-full max-w-full cursor-pointer items-center justify-between border-0 border-b border-border-strong bg-transparent px-0 text-base font-semibold text-white transition-colors hover:border-input-accent hover:text-input-accent focus-visible:border-input-accent focus-visible:text-input-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent data-[state=open]:border-input-accent data-[state=open]:text-input-accent"
                        >
                            <span>{subtitleTextColors[settings.textColor].label}</span>
                            <CaretDownIcon size={16} aria-hidden="true"></CaretDownIcon>
                        </Button>
                    {/snippet}
                    {#snippet content(menuProps)}
                        <div
                            {...menuProps}
                            role="menu"
                            aria-label={m.settings_color()}
                            class="absolute top-full left-0 z-50 mt-2 w-48 bg-panel"
                        >
                            {#each subtitleTextColorOrder as option}
                                <Button
                                    variant="unstyled"
                                    type="button"
                                    class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    onclick={() => {
                                        settings.setTextColor(option);
                                    }}
                                >
                                    {subtitleTextColors[option].label}
                                </Button>
                            {/each}
                        </div>
                    {/snippet}
                </Dropdown>
            </div>

            <div class="text-sm">
                <span class="text-xs text-muted">{m.settings_edge_style()}</span>
                <Dropdown id="subtitle-edge-style">
                    {#snippet trigger(triggerProps)}
                        <Button
                            {...triggerProps}
                            variant="unstyled"
                            aria-label={m.settings_edge_style()}
                            class="appearance-none p-0 mt-2 inline-flex min-h-11 w-full max-w-full cursor-pointer items-center justify-between border-0 border-b border-border-strong bg-transparent px-0 text-base font-semibold text-white transition-colors hover:border-input-accent hover:text-input-accent focus-visible:border-input-accent focus-visible:text-input-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent data-[state=open]:border-input-accent data-[state=open]:text-input-accent"
                        >
                            <span>{subtitleEdgeStyles[settings.edgeStyle].label}</span>
                            <CaretDownIcon size={16} aria-hidden="true"></CaretDownIcon>
                        </Button>
                    {/snippet}
                    {#snippet content(menuProps)}
                        <div
                            {...menuProps}
                            role="menu"
                            aria-label={m.settings_edge_style()}
                            class="absolute top-full left-0 z-50 mt-2 w-48 bg-panel"
                        >
                            {#each subtitleEdgeStyleOrder as option}
                                <Button
                                    variant="unstyled"
                                    type="button"
                                    class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    onclick={() => {
                                        settings.setEdgeStyle(option);
                                    }}
                                >
                                    {subtitleEdgeStyles[option].label}
                                </Button>
                            {/each}
                        </div>
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
                <Dropdown id="subtitle-background">
                    {#snippet trigger(triggerProps)}
                        <Button
                            {...triggerProps}
                            variant="unstyled"
                            aria-label={m.settings_background()}
                            class="appearance-none p-0 mt-2 inline-flex min-h-11 w-full max-w-full cursor-pointer items-center justify-between border-0 border-b border-border-strong bg-transparent px-0 text-base font-semibold text-white transition-colors hover:border-input-accent hover:text-input-accent focus-visible:border-input-accent focus-visible:text-input-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent data-[state=open]:border-input-accent data-[state=open]:text-input-accent"
                        >
                            <span>{subtitleBackgrounds[settings.background].label}</span>
                            <CaretDownIcon size={16} aria-hidden="true"></CaretDownIcon>
                        </Button>
                    {/snippet}
                    {#snippet content(menuProps)}
                        <div
                            {...menuProps}
                            role="menu"
                            aria-label={m.settings_background()}
                            class="absolute top-full left-0 z-50 mt-2 w-48 bg-panel"
                        >
                            {#each subtitleBackgroundOrder as option}
                                <Button
                                    variant="unstyled"
                                    type="button"
                                    class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    onclick={() => {
                                        settings.setBackground(option);
                                    }}
                                >
                                    {subtitleBackgrounds[option].label}
                                </Button>
                            {/each}
                        </div>
                    {/snippet}
                </Dropdown>
            </div>

            <div class="text-sm">
                <span class="text-xs text-muted">{m.settings_opacity()}</span>
                <Dropdown id="subtitle-background-opacity" disabled={settings.background === 'none'}>
                    {#snippet trigger(triggerProps)}
                        <Button
                            {...triggerProps}
                            variant="unstyled"
                            aria-label={m.settings_opacity()}
                            class="appearance-none p-0 mt-2 inline-flex min-h-11 w-full max-w-full cursor-pointer items-center justify-between border-0 border-b border-border-strong bg-transparent px-0 text-base font-semibold text-white transition-colors hover:border-input-accent hover:text-input-accent focus-visible:border-input-accent focus-visible:text-input-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent data-[state=open]:border-input-accent data-[state=open]:text-input-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <span>{Math.round(settings.backgroundOpacity * 100)}%</span>
                            <CaretDownIcon size={16} aria-hidden="true"></CaretDownIcon>
                        </Button>
                    {/snippet}
                    {#snippet content(menuProps)}
                        <div
                            {...menuProps}
                            role="menu"
                            aria-label={m.settings_opacity()}
                            class="absolute top-full left-0 z-50 mt-2 w-48 bg-panel"
                        >
                            {#each subtitleBackgroundOpacities as option}
                                <Button
                                    variant="unstyled"
                                    type="button"
                                    class="block w-full px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    onclick={() => {
                                        settings.setBackgroundOpacity(option);
                                    }}
                                >
                                    {Math.round(option * 100)}%
                                </Button>
                            {/each}
                        </div>
                    {/snippet}
                </Dropdown>
            </div>
        </div>
    </section>

    <div class="pt-6">
        <Button
            variant="outline"
            type="button"
            class="h-auto min-h-10 w-full border-border-strong px-4 text-xs font-bold text-muted uppercase transition-[border-color,color,transform] duration-150 hover:border-foreground hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97] sm:w-auto"
            onclick={() => settings.reset()}
        >
            {m.settings_reset()}
        </Button>
    </div>
</div>
