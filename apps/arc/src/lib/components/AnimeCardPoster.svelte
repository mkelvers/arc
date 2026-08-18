<script lang="ts">
    import { PlayIcon, StarIcon } from 'phosphor-svelte';

    import Card from '$lib/components/ui/card/Card.svelte';
    import CardMedia from '$lib/components/ui/card/CardMedia.svelte';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import Tooltip from '$lib/components/ui/Tooltip.svelte';
    import WatchlistBookmark from '$lib/components/WatchlistBookmark.svelte';
    import type { AnimeCardProps } from './AnimeCard.types';

    let { anime, compact = false, current = false, onselect }: AnimeCardProps = $props();
</script>

<Card selected={current}>
    <div class="transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
        <a
            href={anime.href}
            class="block focus-visible:outline-none"
            aria-current={current ? 'page' : undefined}
            onclick={onselect}
        >
            <CardMedia aspect="poster">
                <ProgressiveImage src={anime.image} alt="" />
            </CardMedia>
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
            <p class="pointer-events-none relative z-10 mt-3 line-clamp-6 text-xs leading-relaxed text-foreground">
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
</Card>
