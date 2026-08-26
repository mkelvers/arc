<script lang="ts">
    import { PlayIcon, StarIcon } from 'phosphor-svelte';

    import Card from '$lib/components/ui/card/Card.svelte';
    import CardMedia from '$lib/components/ui/card/CardMedia.svelte';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import Tooltip from '$lib/components/ui/Tooltip.svelte';
    import WatchlistBookmark from '$lib/components/WatchlistBookmark.svelte';
    import type { AnimeCardProps } from './AnimeCard.types';
    import { m } from '$lib/paraglide/messages.js';

    let {
        anime,
        meta,
        compact = false,
        current = false,
        onselect,
        reserveTitleSpace = true,
        truncateTitle = true,
    }: AnimeCardProps = $props();
</script>

<Card selected={current}>
    <div class="transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
        <a
            href={anime.href}
            class="block focus-visible:outline-none"
            aria-current={current ? 'page' : undefined}
            onclick={onselect}
        >
            <CardMedia aspect="poster" class={compact ? 'sm:aspect-2/3' : undefined}>
                <ProgressiveImage src={anime.image} alt="" />
            </CardMedia>
            <h3
                class:min-h-10={!compact && reserveTitleSpace}
                class:line-clamp-2={truncateTitle}
                class="mt-3 text-sm leading-snug font-semibold"
            >
                {anime.title}
            </h3>
            {#if meta}
                <p class="mt-1.5 text-sm text-muted">{meta}</p>
            {/if}
            {#if anime.audioLabel}
                <p class="mt-1.5 text-sm text-muted">{anime.audioLabel}</p>
            {/if}
        </a>
    </div>
    <ProgressiveImage
        src={anime.image}
        alt=""
        class="pointer-events-none absolute -inset-2 size-auto opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
    />
    <div
        class="pointer-events-none absolute -inset-2 flex flex-col bg-header-hover/95 p-4 pt-6 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
    >
        <a
            href={anime.href}
            class="absolute inset-0 z-0 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-current={current ? 'page' : undefined}
            aria-label={m.shared_view({ title: anime.title })}
            onclick={onselect}
        >
            <span class="sr-only">{m.shared_view({ title: anime.title })}</span>
        </a>
        <h3
            class:line-clamp-2={truncateTitle}
            class="pointer-events-none relative z-10 text-sm leading-snug font-semibold"
        >
            {anime.title}
        </h3>
        {#if anime.score}
            <p class="pointer-events-none relative z-10 mt-3 flex items-center gap-1 text-sm text-muted">
                <span>{anime.score}%</span>
                <StarIcon size="1em" weight="fill" aria-hidden="true" />
                <span class="sr-only">{m.shared_anilist_score()}</span>
            </p>
        {/if}
        {#if anime.genres.length}
            <p class="pointer-events-none relative z-10 mt-3 line-clamp-1 text-xs text-muted">
                {anime.genres.slice(0, 2).join(' · ')}
            </p>
        {/if}
        {#if anime.synopsis}
            <p class="pointer-events-none relative z-10 mt-3 line-clamp-6 text-xs leading-relaxed text-muted">
                {anime.synopsis}
            </p>
        {/if}
        <div class="mt-auto flex items-center gap-2 pt-3 text-accent">
            <Tooltip text={m.shared_play_episode()}>
                <a
                    href={anime.link}
                    class="grid size-9 place-items-center transition-[opacity,transform] duration-150 hover:opacity-80 focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent active:scale-90"
                    aria-label={m.shared_start_watching({ title: anime.title })}
                    onclick={onselect}
                >
                    <PlayIcon size="1.55rem" weight="bold" aria-hidden="true" />
                </a>
            </Tooltip>
            <WatchlistBookmark animeId={anime.id} title={anime.title} />
        </div>
    </div>
</Card>
