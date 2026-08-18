<script lang="ts">
    import { PlayIcon, StarIcon } from 'phosphor-svelte';

    import type { AnimeCard } from '$lib/types';
    import ProgressiveImage from '$lib/components/ProgressiveImage.svelte';
    import Tooltip from '$lib/components/Tooltip.svelte';
    import WatchlistBookmark from '$lib/components/WatchlistBookmark.svelte';

    interface Props {
        anime: AnimeCard & {
            backdrop?: string | null;
        };
        current?: boolean;
        compact?: boolean;
        onselect?: () => void;
        variant?: 'poster' | 'compact' | 'top';
    }

    let { anime, current = false, compact = false, onselect, variant = 'poster' }: Props = $props();
</script>

{#if variant === 'compact'}
    <article class="group relative min-w-0 transition-colors hover:bg-surface focus-within:bg-surface">
        <a
            href={anime.href}
            class="absolute inset-0 z-0 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={`View ${anime.title}`}
            onclick={onselect}
        >
            <span class="sr-only">View {anime.title}</span>
        </a>
        <div class="flex min-h-28 gap-3 p-2">
            <div class="aspect-2/3 h-24 shrink-0 overflow-hidden bg-surface">
                <ProgressiveImage src={anime.image} alt="" />
            </div>
            <div class="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col py-1">
                <h3 class="line-clamp-1 text-sm leading-snug font-semibold">{anime.title}</h3>
                {#if anime.genres.length}
                    <p class="mt-1.5 line-clamp-1 text-xs text-muted">
                        {anime.genres.slice(0, 3).join(' · ')}
                    </p>
                {/if}
                {#if anime.audioLabel}
                    <p
                        class="mt-auto text-sm text-muted transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
                    >
                        {anime.audioLabel}
                    </p>
                {/if}
                <div
                    class="pointer-events-none absolute right-0 bottom-0 left-0 flex items-center justify-between gap-3 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                >
                    {#if anime.score}
                        <p class="flex items-center gap-1 text-sm text-muted">
                            <span>{anime.score}%</span>
                            <StarIcon size="1em" weight="fill" aria-hidden="true" />
                            <span class="sr-only">AniList score</span>
                        </p>
                    {/if}
                    <div class="ml-auto flex items-center gap-1 text-accent">
                        <Tooltip text="Play episode 1">
                            <a
                                href={anime.link}
                                class="grid size-9 place-items-center"
                                aria-label={`Start watching ${anime.title}`}
                                onclick={onselect}
                            >
                                <PlayIcon size="1.45rem" weight="bold" aria-hidden="true" />
                            </a>
                        </Tooltip>
                        <WatchlistBookmark animeId={anime.id} title={anime.title} iconSize="1.45rem" />
                    </div>
                </div>
            </div>
        </div>
    </article>
{:else if variant === 'top'}
    <article class="group relative min-w-0 text-foreground">
        <div class="transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
            <a
                href={anime.href}
                class="block focus-visible:outline-none"
                aria-label={`View ${anime.title}`}
                onclick={onselect}
            >
                <div class="aspect-video overflow-hidden bg-surface">
                    <ProgressiveImage src={anime.backdrop ?? anime.image} alt="" previewSize="w300" />
                </div>
                <h3 class="mt-3 line-clamp-2 min-h-10 text-sm leading-snug font-semibold">
                    {anime.title}
                </h3>
                {#if anime.audioLabel}
                    <p class="mt-1.5 text-sm text-muted">
                        {anime.audioLabel}
                    </p>
                {/if}
            </a>
        </div>
        <div
            class="pointer-events-none absolute inset-0 flex flex-col bg-surface p-4 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        >
            <a
                href={anime.href}
                class="absolute inset-0 z-0"
                aria-label={`View ${anime.title}`}
                onclick={onselect}
            >
                <span class="sr-only">View {anime.title}</span>
            </a>
            <h3 class="pointer-events-none relative z-10 line-clamp-2 text-sm leading-snug font-semibold">
                {anime.title}
            </h3>
            {#if anime.score}
                <p class="pointer-events-none relative z-10 mt-2.5 flex items-center gap-1 text-sm text-muted">
                    <span>{anime.score}%</span>
                    <StarIcon size="1em" weight="fill" aria-hidden="true" />
                    <span class="sr-only">AniList score</span>
                </p>
            {/if}
            {#if anime.genres.length}
                <p class="pointer-events-none relative z-10 mt-2.5 line-clamp-1 text-xs text-muted">
                    {anime.genres.slice(0, 4).join(' · ')}
                </p>
            {/if}
            {#if anime.synopsis}
                <p class="pointer-events-none relative z-10 mt-3 line-clamp-4 text-xs leading-relaxed text-muted">
                    {anime.synopsis}
                </p>
            {/if}
            <div class="relative z-10 mt-auto flex items-center gap-2 pt-3 text-accent">
                <Tooltip text="Play episode 1">
                    <a
                        href={anime.link}
                        class="grid size-9 place-items-center"
                        aria-label={`Start watching ${anime.title}`}
                        onclick={onselect}
                    >
                        <PlayIcon size="1.55rem" weight="bold" aria-hidden="true" />
                    </a>
                </Tooltip>
                <WatchlistBookmark animeId={anime.id} title={anime.title} />
            </div>
        </div>
    </article>
{:else}
    <article
        class:border-foreground={current}
        class:border-transparent={!current}
        class="group relative isolate min-w-0 p-2 text-foreground transition-colors focus-within:z-10 focus-within:border-foreground hover:z-10"
    >
        <div class="transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
            <a
                href={anime.href}
                class="block focus-visible:outline-none"
                aria-current={current ? 'page' : undefined}
                onclick={onselect}
            >
                <div class="aspect-2/3 overflow-hidden bg-surface">
                    <ProgressiveImage src={anime.image} alt="" />
                </div>
                <h3 class:min-h-10={!compact} class="mt-3 line-clamp-2 text-sm leading-snug font-semibold">
                    {anime.title}
                </h3>
                {#if anime.audioLabel}
                    <p class="mt-1.5 text-sm text-muted">{anime.audioLabel}</p>
                {/if}
            </a>
        </div>

        <ProgressiveImage
            src={anime.image}
            alt=""
            class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        />
        <div
            class="pointer-events-none absolute inset-0 flex flex-col bg-surface/88 p-4 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        >
            <a
                href={anime.href}
                class="absolute inset-0 z-0 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-current={current ? 'page' : undefined}
                aria-label={`View ${anime.title}`}
                onclick={onselect}
            >
                <span class="sr-only">View {anime.title}</span>
            </a>

            <h3 class="pointer-events-none relative z-10 line-clamp-2 text-sm leading-snug font-semibold">
                {anime.title}
            </h3>

            {#if anime.score}
                <p class="pointer-events-none relative z-10 mt-3 flex items-center gap-1 text-sm text-muted">
                    <span>{anime.score}%</span>
                    <StarIcon size="1em" weight="fill" aria-hidden="true" />
                    <span class="sr-only">AniList score</span>
                </p>
            {/if}

            {#if anime.genres.length}
                <p class="pointer-events-none relative z-10 mt-3 line-clamp-1 text-xs font-semibold text-muted">
                    {anime.genres.slice(0, 2).join(' · ')}
                </p>
            {/if}

            {#if anime.synopsis}
                <p
                    class="pointer-events-none relative z-10 mt-3 line-clamp-6 text-xs leading-relaxed text-foreground"
                >
                    {anime.synopsis}
                </p>
            {/if}

            <div class="mt-auto flex items-center gap-2 pt-3 text-accent">
                <Tooltip text="Play E1">
                    <a
                        href={anime.link}
                        class="grid size-9 place-items-center transition-colors focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent"
                        aria-label={`Start watching ${anime.title}`}
                        onclick={onselect}
                    >
                        <PlayIcon size="1.55rem" weight="bold" aria-hidden="true" />
                    </a>
                </Tooltip>
                <WatchlistBookmark animeId={anime.id} title={anime.title} />
            </div>
        </div>
    </article>
{/if}
