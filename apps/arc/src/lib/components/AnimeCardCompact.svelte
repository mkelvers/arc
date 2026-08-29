<script lang="ts">
    import { PlayIcon, StarIcon } from 'phosphor-svelte';

    import Card from '$lib/components/ui/card/Card.svelte';
    import CardMedia from '$lib/components/ui/card/CardMedia.svelte';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import Tooltip from '$lib/components/ui/Tooltip.svelte';
    import WatchlistBookmark from '$lib/components/WatchlistBookmark.svelte';
    import type { AnimeCardProps } from './AnimeCard.types';
    import { m } from '$lib/i18n.svelte';

    let { anime, onselect }: AnimeCardProps = $props();
</script>

<Card variant="compact">
    <a
        href={anime.href}
        class="absolute inset-0 z-0 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label={m.shared_view({ title: anime.title })}
        onclick={onselect}
    >
        <span class="sr-only">{m.shared_view({ title: anime.title })}</span>
    </a>
    <div class="flex min-h-28 gap-3 p-2">
        <CardMedia aspect="poster" class="h-24 shrink-0">
            <ProgressiveImage src={anime.image} alt="" displaySize="w342" sizes="6rem" />
        </CardMedia>
        <div class="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col py-1">
            <h3 class="line-clamp-1 text-sm leading-snug font-semibold">{anime.title}</h3>
            {#if anime.genres.length}
                <p class="mt-1.5 line-clamp-1 text-xs text-muted">{anime.genres.slice(0, 3).join(' · ')}</p>
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
                        <span class="sr-only">{m.shared_anilist_score()}</span>
                    </p>
                {/if}
                <div class="ml-auto flex items-center gap-1 text-accent">
                    <Tooltip text={m.shared_play_episode()}>
                        <a
                            href={anime.link}
                            class="grid size-9 place-items-center transition-[opacity,transform] duration-150 hover:opacity-80 active:scale-90"
                            aria-label={m.shared_start_watching({ title: anime.title })}
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
</Card>
