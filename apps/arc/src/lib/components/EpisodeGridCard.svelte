<script lang="ts">
    import { CalendarBlankIcon, PlayIcon } from 'phosphor-svelte';

    import { audioAvailabilityLabel } from '@arc/shared/audio';
    import type { AnimeEpisode } from '@arc/shared/types';
    import { cn } from '$lib/utils';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import { m } from '$lib/paraglide/messages.js';

    interface Props {
        episode: AnimeEpisode;
        title: string;
        image?: string | null;
        current?: boolean;
        context?: 'detail' | 'dialog' | 'watch';
    }

    let { episode, title, image = null, current = false, context = 'detail' }: Props = $props();
    const dialog = $derived(context === 'dialog');
    const heading = $derived(episode.title ? `${episode.label} – ${episode.title}` : episode.label);
</script>

{#if context === 'watch'}
    <a
        href={episode.href}
        class="group flex gap-3 focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-white"
    >
        <div class="relative aspect-video w-36 shrink-0 overflow-hidden bg-media-tile">
            {#if episode.image || image}
                <ProgressiveImage
                    src={episode.image ?? image ?? ''}
                    alt=""
                    imageClass="transition-transform duration-200 group-hover:scale-105"
                />
            {/if}
            {#if episode.duration}
                <span class="absolute right-1.5 bottom-1.5 bg-black/75 px-1.5 py-0.5 text-sm font-bold text-white">
                    {episode.duration}
                </span>
            {/if}
        </div>
        <div class="min-w-0 self-center">
            <h3 class="line-clamp-3 text-sm leading-snug font-bold text-white">{heading}</h3>
            <p class="mt-1.5 text-sm text-watch-muted">{audioAvailabilityLabel(episode.audio)}</p>
        </div>
    </a>
{:else}
    <a
        href={episode.href}
        aria-current={current ? 'page' : undefined}
        class={cn(
            'group relative block min-w-0',
            dialog
                ? 'min-h-72 p-3 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white'
                : 'min-h-56 focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none',
            current && 'bg-panel-selected'
        )}
    >
        <div class="transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0">
            <div class={cn('relative aspect-video overflow-hidden', dialog ? 'bg-media-tile' : 'bg-surface')}>
                {#if episode.image || image}
                    <ProgressiveImage
                        src={episode.image ?? image ?? ''}
                        alt=""
                        imageClass={cn(!dialog && 'brightness-75')}
                    />
                {/if}
                {#if current}
                    <span
                        class={cn(
                            'absolute left-2 bg-accent px-2 py-1 text-xs font-bold text-black uppercase',
                            'top-2'
                        )}
                    >
                        {m.player_now_playing()}
                    </span>
                {/if}
                {#if episode.duration}
                    <span
                        class={cn(
                            'absolute bg-black/75 px-1.5 py-0.5 font-bold text-white',
                            dialog ? 'right-1.5 bottom-1.5 text-sm' : 'right-2 bottom-2 text-xs'
                        )}
                    >
                        {episode.duration}
                    </span>
                {/if}
            </div>

            <div class={cn(!dialog && 'mt-3 min-w-0')}>
                <p
                    class={cn(
                        'line-clamp-1 text-xs uppercase',
                        dialog ? 'mt-3 font-semibold text-watch-muted' : 'font-medium text-subtle'
                    )}
                >
                    {title}
                </p>
                <h3
                    class={cn(
                        'line-clamp-2 font-bold',
                        dialog
                            ? 'mt-2 text-base leading-snug text-white'
                            : 'mt-1 text-sm leading-snug text-foreground'
                    )}
                >
                    {heading}
                </h3>
                <p class={cn('mt-3 text-sm', dialog ? 'text-watch-muted' : 'text-muted')}>
                    {audioAvailabilityLabel(episode.audio)}
                </p>
            </div>
        </div>

        <div
            class={cn(
                'pointer-events-none absolute inset-0 z-10 flex flex-col p-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100',
                dialog ? 'bg-panel-strong' : 'bg-surface'
            )}
        >
            <p
                class={cn(
                    'line-clamp-1 text-xs uppercase',
                    dialog ? 'font-semibold text-watch-muted' : 'font-medium text-subtle'
                )}
            >
                {title}
            </p>
            <h3
                class={cn(
                    'mt-2 line-clamp-2 font-bold',
                    dialog ? 'text-base leading-snug text-white' : 'text-sm leading-snug text-foreground'
                )}
            >
                {heading}
            </h3>
            {#if episode.releaseDate}
                <div
                    class={cn(
                        'mt-1 flex items-center gap-1.5 text-xs',
                        dialog ? 'text-watch-muted' : 'text-muted'
                    )}
                >
                    <CalendarBlankIcon size="0.875rem" aria-hidden="true" />
                    <span>{episode.releaseDate}</span>
                </div>
            {/if}
            {#if episode.overview}
                <p
                    class={cn(
                        'text-foreground',
                        dialog
                            ? 'mt-3 line-clamp-8 text-sm leading-5 text-watch-primary'
                            : 'mt-2 line-clamp-6 text-xs leading-4'
                    )}
                >
                    {episode.overview}
                </p>
            {/if}
            <span class="mt-auto inline-flex items-center gap-2 pt-3 text-xs font-bold text-accent uppercase">
                <PlayIcon size="1.25rem" weight="bold" aria-hidden="true" />
                {m.player_play_episode({ episode: episode.label })}
            </span>
        </div>
    </a>
{/if}
