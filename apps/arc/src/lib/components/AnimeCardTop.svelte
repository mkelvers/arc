<script lang="ts">
    import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
    import StarIcon from 'phosphor-svelte/lib/StarIcon';

    import Card from '$lib/components/ui/card/Card.svelte';
    import CardMedia from '$lib/components/ui/card/CardMedia.svelte';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import Tooltip from '$lib/components/ui/Tooltip.svelte';
    import WatchlistBookmark from '$lib/components/WatchlistBookmark.svelte';
    import type { AnimeCardProps } from './AnimeCard.types';
    import { m } from '$lib/i18n.svelte';

    let { anime, onselect }: AnimeCardProps = $props();
</script>

<Card variant="landscape">
    <div class="transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
        <a
            href={anime.href}
            class="block focus-visible:outline-none"
            aria-label={m.shared_view({ title: anime.title })}
            onclick={onselect}
        >
            <CardMedia aspect="video">
                <ProgressiveImage
                    src={anime.backdrop ?? anime.image}
                    alt=""
                    previewSize="w300"
                    displaySize="w780"
                />
            </CardMedia>
            <h3 class="mt-3 line-clamp-2 min-h-10 text-sm leading-snug font-semibold">{anime.title}</h3>
            {#if anime.audioLabel}
                <p class="mt-1.5 text-sm text-muted">{anime.audioLabel}</p>
            {/if}
        </a>
    </div>
    <div
        class="pointer-events-none absolute inset-0 flex flex-col bg-surface p-4 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
    >
        <a
            href={anime.href}
            class="absolute inset-0 z-0"
            aria-label={m.shared_view({ title: anime.title })}
            onclick={onselect}
        >
            <span class="sr-only">{m.shared_view({ title: anime.title })}</span>
        </a>
        <h3 class="pointer-events-none relative z-10 line-clamp-2 text-sm leading-snug font-semibold">
            {anime.title}
        </h3>
        {#if anime.score}
            <p class="pointer-events-none relative z-10 mt-2.5 flex items-center gap-1 text-sm text-muted">
                <span>{anime.score}%</span>
                <StarIcon size="1em" weight="fill" aria-hidden="true" />
                <span class="sr-only">{m.shared_anilist_score()}</span>
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
            <Tooltip text={m.shared_play_episode()}>
                <a
                    href={anime.link}
                    class="grid size-9 place-items-center transition-[opacity,transform] duration-150 hover:opacity-80 active:scale-90"
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
