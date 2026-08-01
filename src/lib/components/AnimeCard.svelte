<script lang="ts">
    import {
        BookmarkSimpleIcon,
        PlayIcon,
        StarIcon,
    } from 'phosphor-svelte';

    import type { AnimeCard } from '$lib/anime/types';
    import Tooltip from '$lib/components/Tooltip.svelte';

    interface Props {
        anime: AnimeCard;
        current?: boolean;
        compact?: boolean;
        onselect?: (anime: AnimeCard) => void;
    }

    let {
        anime,
        current = false,
        compact = false,
        onselect,
    }: Props = $props();
</script>

<article
    class:border-foreground={current}
    class:border-transparent={!current}
    class="group relative isolate min-w-0 overflow-hidden p-2 text-foreground transition-colors focus-within:z-10 focus-within:border-foreground hover:z-10 hover:bg-surface/88"
>
    <div class="transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
        <a
            href={anime.href}
            class="block focus-visible:outline-none"
            aria-current={current ? 'page' : undefined}
            onclick={() => onselect?.(anime)}
        >
            <div class="aspect-2/3 overflow-hidden bg-surface">
                <img
                    src={anime.image}
                    alt=""
                    class="size-full object-cover"
                    loading="lazy"
                />
            </div>
            <h3
                class:min-h-10={!compact}
                class="mt-3 line-clamp-2 text-sm leading-snug font-semibold"
            >
                {anime.title}
            </h3>
            {#if anime.caption}
                <p class="mt-1.5 text-sm text-muted">{anime.caption}</p>
            {/if}
        </a>
    </div>

    <img
        src={anime.image}
        alt=""
        class="pointer-events-none absolute inset-0 -z-20 size-full object-cover opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        loading="lazy"
    />
    <div
        class="pointer-events-none absolute inset-0 -z-10 bg-surface/88 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        aria-hidden="true"
    ></div>

    <div
        class="pointer-events-none absolute inset-2 flex flex-col overflow-hidden p-3 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
    >
        <a
            href={anime.href}
            class="absolute inset-0 z-0 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-current={current ? 'page' : undefined}
            aria-label={`View ${anime.title}`}
            onclick={() => onselect?.(anime)}
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
            <p class="pointer-events-none relative z-10 mt-3 line-clamp-6 text-xs leading-relaxed text-foreground">
                {anime.synopsis}
            </p>
        {/if}

        <div class="relative z-10 mt-auto flex items-center gap-2 pt-3 text-accent">
            <Tooltip text="Play E1">
                <a
                    href={anime.watchHref}
                    class="grid size-9 place-items-center transition-colors focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent"
                    aria-label={`Start watching ${anime.title}`}
                    onclick={() => onselect?.(anime)}
                >
                    <PlayIcon size="1.55rem" weight="bold" aria-hidden="true" />
                </a>
            </Tooltip>
            <Tooltip text="Add to Watchlist">
                <button
                    type="button"
                    class="grid size-9 place-items-center text-accent opacity-60"
                    aria-label={`Add ${anime.title} to watchlist (coming soon)`}
                    disabled
                >
                    <BookmarkSimpleIcon
                        size="1.55rem"
                        weight="regular"
                        aria-hidden="true"
                    />
                </button>
            </Tooltip>
        </div>
    </div>
</article>
