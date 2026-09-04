<script module lang="ts">
    import type { AnimeCard } from '@arc/core/client';

    export type AnimeCardItem = AnimeCard & {
        backdrop?: string | null;
    };
</script>

<script lang="ts">
    import { PlayIcon, StarIcon } from 'phosphor-svelte';

    import { m } from '$lib/i18n.svelte';
    import { cn } from '$lib/utils';
    import WatchlistBookmark from '$lib/components/WatchlistBookmark.svelte';
    import Card from '$lib/components/ui/card/Card.svelte';
    import CardMedia from '$lib/components/ui/card/CardMedia.svelte';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import Tooltip from '$lib/components/ui/Tooltip.svelte';

    interface Props {
        anime: AnimeCardItem;
        meta?: string;
        compact?: boolean;
        current?: boolean;
        showActions?: boolean;
        onselect?: () => void;
        reserveTitleSpace?: boolean;
        truncateTitle?: boolean;
        variant?: 'poster' | 'compact' | 'top';
    }

    let {
        anime,
        meta,
        compact = false,
        current = false,
        showActions = true,
        onselect,
        reserveTitleSpace = true,
        truncateTitle = true,
        variant = 'poster',
    }: Props = $props();
</script>

{#if variant === 'compact'}
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
                {#if anime.image}
                    <ProgressiveImage src={anime.image} alt="" displaySize="w342" sizes="6rem" />
                {/if}
            </CardMedia>
            <div class="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col py-1">
                <h3 class="line-clamp-1 text-sm leading-snug font-semibold">{anime.title}</h3>
                {#if anime.genres.length}<p class="mt-1.5 line-clamp-1 text-xs text-muted">
                        {anime.genres.slice(0, 3).join(' · ')}
                    </p>{/if}
                {#if anime.audioLabel}<p
                        class="mt-auto text-sm text-muted transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
                    >
                        {anime.audioLabel}
                    </p>{/if}
                {#if showActions}
                    <div
                        class="pointer-events-none absolute right-0 bottom-0 left-0 flex items-center justify-between gap-3 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                    >
                        {#if anime.score}<p class="flex items-center gap-1 text-sm text-muted">
                                <span>{anime.score}%</span>
                                <StarIcon size="1em" weight="fill" aria-hidden="true" />
                                <span class="sr-only">{m.shared_anilist_score()}</span>
                            </p>{/if}
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
                {/if}
            </div>
        </div>
    </Card>
{:else if variant === 'top'}
    <Card variant="landscape">
        <div class="transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
            <a
                href={anime.href}
                class="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-label={m.shared_view({ title: anime.title })}
                onclick={onselect}
            >
                <CardMedia aspect="video">
                    {#if anime.backdrop ?? anime.image}
                        <ProgressiveImage
                            src={anime.backdrop ?? anime.image}
                            alt=""
                            previewSize="w300"
                            displaySize="w780"
                        />
                    {/if}
                </CardMedia>
                <h3 class="mt-3 line-clamp-2 min-h-10 text-sm leading-snug font-semibold">{anime.title}</h3>
                {#if anime.audioLabel}<p class="mt-1.5 text-sm text-muted">{anime.audioLabel}</p>{/if}
            </a>
        </div>
        <div
            class="pointer-events-none absolute inset-0 flex flex-col bg-surface p-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        >
            <div class="pointer-events-none" aria-hidden="true">
                <h3 class="line-clamp-2 text-sm leading-snug font-semibold">{anime.title}</h3>
                {#if anime.score}<p class="mt-2.5 flex items-center gap-1 text-sm text-muted">
                        <span>{anime.score}%</span>
                        <StarIcon size="1em" weight="fill" aria-hidden="true" />
                        <span class="sr-only">{m.shared_anilist_score()}</span>
                    </p>{/if}
                {#if anime.genres.length}<p class="mt-2.5 line-clamp-1 text-xs text-muted">
                        {anime.genres.slice(0, 4).join(' · ')}
                    </p>{/if}
                {#if anime.synopsis}<p class="mt-3 line-clamp-4 text-xs leading-relaxed text-muted">
                        {anime.synopsis}
                    </p>{/if}
            </div>
            {#if showActions}
                <div class="pointer-events-auto relative z-10 mt-auto flex items-center gap-2 pt-3 text-accent">
                    <Tooltip text={m.shared_play_episode()}>
                        <a
                            href={anime.link}
                            class="grid size-9 place-items-center transition-[opacity,transform] duration-150 hover:opacity-80 active:scale-90"
                            aria-label={m.shared_start_watching({ title: anime.title })}
                            onclick={onselect}
                        >
                            <PlayIcon size="1.55rem" weight="bold" aria-hidden="true" />
                        </a>
                    </Tooltip><WatchlistBookmark animeId={anime.id} title={anime.title} />
                </div>
            {/if}
        </div>
    </Card>
{:else}
    <Card selected={current}>
        <div class="transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
            <a
                href={anime.href}
                class="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-current={current ? 'page' : undefined}
                onclick={onselect}
            >
                <CardMedia aspect="poster" class={cn(compact && 'sm:aspect-2/3')}>
                    <ProgressiveImage
                        src={anime.image}
                        alt=""
                        displaySize="w500"
                        sizes="(min-width: 1024px) 10rem, 45vw"
                    />
                </CardMedia>
                <h3
                    class:min-h-10={!compact && reserveTitleSpace}
                    class:line-clamp-2={truncateTitle}
                    class="mt-3 text-sm leading-snug font-semibold"
                >
                    {anime.title}
                </h3>
                {#if meta}<p class="mt-1.5 text-sm text-muted">{meta}</p>{/if}
                {#if anime.audioLabel}<p class="mt-1.5 text-sm text-muted">{anime.audioLabel}</p>{/if}
            </a>
        </div>
        {#if anime.image}
            <ProgressiveImage
                src={anime.image}
                alt=""
                displaySize="w500"
                sizes="(min-width: 1024px) 10rem, 45vw"
                class="pointer-events-none absolute -inset-2 size-auto opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
            />
        {/if}
        <div
            class="pointer-events-none absolute -inset-2 flex flex-col bg-header-hover/95 p-4 pt-6 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        >
            <div class="pointer-events-none" aria-hidden="true">
                <h3 class:line-clamp-2={truncateTitle} class="text-sm leading-snug font-semibold">
                    {anime.title}
                </h3>
                {#if anime.score}<p class="mt-3 flex items-center gap-1 text-sm text-muted">
                        <span>{anime.score}%</span>
                        <StarIcon size="1em" weight="fill" aria-hidden="true" />
                        <span class="sr-only">{m.shared_anilist_score()}</span>
                    </p>{/if}
                {#if anime.genres.length}<p class="mt-3 line-clamp-1 text-xs text-muted">
                        {anime.genres.slice(0, 2).join(' · ')}
                    </p>{/if}
                {#if anime.synopsis}<p class="mt-3 line-clamp-6 text-xs leading-relaxed text-muted">
                        {anime.synopsis}
                    </p>{/if}
            </div>
            {#if showActions}
                <div class="pointer-events-auto mt-auto flex items-center gap-2 pt-3 text-accent">
                    <Tooltip text={m.shared_play_episode()}>
                        <a
                            href={anime.link}
                            class="grid size-9 place-items-center transition-[opacity,transform] duration-150 hover:opacity-80 focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent active:scale-90"
                            aria-label={m.shared_start_watching({ title: anime.title })}
                            onclick={onselect}
                        >
                            <PlayIcon size="1.55rem" weight="bold" aria-hidden="true" />
                        </a>
                    </Tooltip><WatchlistBookmark animeId={anime.id} title={anime.title} />
                </div>
            {/if}
        </div>
    </Card>
{/if}
