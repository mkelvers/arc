<script lang="ts">
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import EpisodeGridCard from '$lib/components/EpisodeGridCard.svelte';
    import FranchiseOrder from './FranchiseOrder.svelte';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import WatchlistBookmark from '$lib/components/WatchlistBookmark.svelte';
    import AiringStatus from './AiringStatus.svelte';
    import WatchlistStatusMenu from './WatchlistStatusMenu.svelte';
    import { cn } from '$lib/utils';
    import type { PageData } from '../$types';
    import { DotsThreeVerticalIcon, EyeIcon, EyeSlashIcon, PlayIcon } from 'phosphor-svelte';

    type PageResult = Awaited<PageData['page']>;
    type Props = { data: Extract<PageResult, { status: 'success' }>['data'] };

    let { data }: Props = $props();

    let detailsExpanded = $state(false);
    let hideFiller = $state(false);
    let loadedBackdrop = $state<string | null>(null);
</script>

<main class="bg-canvas text-foreground">
    <section class="min-h-dvh">
        <figure
            class="anime-hero relative z-10 grid h-dvh min-h-120 max-h-192 grid-cols-1 grid-rows-1 bg-black before:pointer-events-none before:col-start-1 before:row-start-1 before:z-10 before:h-full after:pointer-events-none after:col-start-1 after:row-start-1 after:z-10 after:h-full sm:min-h-150 lg:min-h-175 lg:max-h-300"
        >
            {#await data.artwork then artwork}
                {#if artwork?.selectedBackdrop}
                    <ProgressiveImage
                        src={artwork.selectedBackdrop.url}
                        alt={data.anime.title}
                        previewSize="w300"
                        class="z-0 col-start-1 row-start-1"
                        imageClass="object-[center_0%]"
                        onready={() => (loadedBackdrop = artwork.selectedBackdrop?.url ?? null)}
                    />
                {/if}
            {/await}

            <div
                class="z-30 col-start-1 row-start-1 mt-3 mr-3 self-start justify-self-end font-bold sm:mt-5 sm:mr-8 lg:mr-12"
            >
                <Dropdown
                    id="more-options"
                    items={[{ label: 'View Media Options', href: `/anime/${data.anime.id}/media` }]}
                >
                    {#snippet trigger()}
                        <span class="flex min-h-11 items-center gap-3 text-sm leading-none">
                            <DotsThreeVerticalIcon size="1.5rem" weight="bold" aria-hidden="true" />
                            <span>More</span>
                        </span>
                    {/snippet}
                </Dropdown>
            </div>

            <div class="z-20 col-start-1 row-start-1 min-w-0 self-end px-5 pb-10 sm:px-10 lg:px-16 lg:pb-20">
                <div class="w-fit">
                    {#await data.artwork then artwork}
                        {#if artwork?.selectedLogo}
                            <img
                                src={artwork.selectedLogo.url}
                                alt={data.anime.title}
                                style:height={`clamp(${(5 * artwork.logoSize) / 100}rem, ${(6.4 * artwork.logoSize) / 100}vw, ${(8 * artwork.logoSize) / 100}rem)`}
                                class={cn(
                                    'max-w-[65vw] object-contain object-left opacity-0 transition-opacity duration-300 sm:max-w-md lg:max-w-lg 2xl:max-w-2xl',
                                    (!artwork.selectedBackdrop ||
                                        loadedBackdrop === artwork.selectedBackdrop.url) &&
                                        'opacity-100'
                                )}
                            />
                        {:else if !artwork}
                            <h1
                                class="max-w-3xl text-4xl leading-tight font-bold text-white sm:text-5xl lg:text-6xl"
                            >
                                {data.anime.title}
                            </h1>
                        {/if}
                    {/await}
                </div>

                {#if data.anime.status === 'RELEASING' && data.anime.nextAiringEpisode}
                    <AiringStatus
                        animeId={data.anime.id}
                        airingAt={data.anime.nextAiringEpisode.airingAt}
                        initialRevision={data.episodeRevision}
                    />
                {/if}

                <p
                    class={cn(
                        'flex flex-wrap items-center gap-y-1 text-sm text-muted lg:text-base',
                        data.anime.status === 'RELEASING' && data.anime.nextAiringEpisode
                            ? 'mt-3'
                            : 'mt-8 sm:mt-10 lg:mt-11'
                    )}
                >
                    {#await data.audioLabel then audioLabel}
                        {#if audioLabel}
                            <span class="anime-hero-metadata__tag">{audioLabel}</span>
                        {/if}
                    {/await}
                    {#if data.anime.genres.length}
                        <span class="anime-hero-metadata__tag">
                            {#each data.anime.genres as genre, index}
                                {#if index > 0}<span aria-hidden="true">,</span>{/if}
                                <a
                                    class="underline underline-offset-2"
                                    href={`/browse?genre=${encodeURIComponent(genre)}`}
                                >
                                    {genre}
                                </a>
                            {/each}
                        </span>
                    {/if}
                </p>

                <div
                    class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm sm:text-base lg:mt-3.5 lg:gap-2.5 lg:text-base"
                >
                    <span class="flex items-center gap-0.5 text-muted" aria-hidden="true">
                        {#each Array(5) as _}
                            <svg class="size-6 fill-current sm:size-7" viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                    d="m12 2 2.85 6.59L22 9.27 16.55 14l1.63 7L12 17.27 5.82 21l1.63-7L2 9.27l7.15-.68z"
                                />
                            </svg>
                        {/each}
                    </span>
                    <span class="hidden text-border-strong sm:inline" aria-hidden="true">|</span>
                    <strong>AniList score: {data.anime.score}%</strong>
                </div>

                <div
                    class="mt-7 flex items-center gap-2 text-xs font-bold text-accent sm:text-sm lg:mt-8 lg:gap-2.5"
                >
                    {#await data.watchAction}
                        <a
                            href="#anime-episode-list"
                            class="flex h-10 items-center gap-2.5 bg-accent px-4 text-on-accent uppercase sm:px-6"
                        >
                            <PlayIcon size="1.55em" weight="bold" aria-hidden="true" />
                            View episodes
                        </a>
                    {:then watchAction}
                        <a
                            href={watchAction.href}
                            class="flex h-10 items-center gap-2.5 bg-accent px-4 text-on-accent uppercase sm:px-6"
                        >
                            <PlayIcon size="1.55em" weight="bold" aria-hidden="true" />
                            {watchAction.label}
                        </a>
                    {/await}
                    <WatchlistBookmark
                        animeId={data.anime.id}
                        title={data.anime.title}
                        iconSize="1.65em"
                        outlined
                    />
                    <WatchlistStatusMenu
                        animeId={data.anime.id}
                        title={data.anime.title}
                        initialState={data.watchlistState ?? undefined}
                    />
                </div>
            </div>
        </figure>

        <div class="px-5 pt-7 sm:px-10 lg:px-16 lg:pt-8">
            <div class="border-b border-border">
                <section
                    id="anime-details"
                    class={cn(
                        'grid min-w-0 max-w-432 grid-cols-1 gap-8 overflow-hidden text-xs leading-5 text-muted md:grid-cols-2 md:gap-12 lg:gap-28 lg:text-sm lg:leading-6',
                        detailsExpanded
                            ? 'max-h-320'
                            : 'max-h-24 [mask-image:linear-gradient(to_bottom,black_45%,transparent_100%)]'
                    )}
                >
                    <p class="max-w-3xl text-foreground">{data.anime.description}</p>
                    <div class="space-y-3">
                        <p>
                            <strong class="font-normal text-foreground">Production:</strong>
                            {data.anime.studios.join(', ')}
                        </p>
                        <p>
                            <strong class="font-normal text-foreground">Key staff:</strong>
                            {data.anime.staff}
                        </p>
                        <p>
                            <strong class="font-normal text-foreground">Rankings:</strong>
                            {data.anime.rankings.join(', ')}
                        </p>
                        <p>
                            <strong class="font-normal text-foreground">Audience:</strong>
                            {data.anime.members} members, {data.anime.favourites} favorites
                        </p>
                        <p>
                            <strong class="font-normal text-foreground">Themes:</strong>
                            {data.anime.themes.join(', ')}
                        </p>
                        <p>
                            <strong class="font-normal text-foreground">Genres:</strong>
                            {#each data.anime.genres as genre, index}
                                {#if index > 0}<span aria-hidden="true">,</span>{/if}
                                <a
                                    class="underline underline-offset-2"
                                    href={`/browse?genre=${encodeURIComponent(genre)}`}
                                >
                                    {genre}
                                </a>
                            {/each}
                        </p>
                    </div>
                </section>

                <button
                    type="button"
                    class="min-h-11 text-xs font-semibold text-accent uppercase"
                    aria-expanded={detailsExpanded}
                    aria-controls="anime-details"
                    onclick={() => (detailsExpanded = !detailsExpanded)}
                >
                    {detailsExpanded ? 'Fewer details' : 'More details'}
                </button>
            </div>
        </div>
    </section>

    <div class="px-3 sm:px-8 lg:px-14">
        {#snippet loadingEpisodes()}
            <section
                id="anime-episode-list"
                class="px-2 py-7 sm:pb-12 lg:pb-16"
                aria-busy="true"
                aria-live="polite"
            >
                <span class="sr-only">Loading episodes</span>
                <div class="grid grid-cols-1 gap-x-5 gap-y-8 md:grid-cols-5 2xl:grid-cols-7">
                    {#each Array.from({ length: 5 }) as _}
                        <div class="min-h-56 animate-pulse motion-reduce:animate-none" aria-hidden="true">
                            <div class="aspect-video bg-surface"></div>
                            <div class="mt-3 h-3 w-2/3 rounded-full bg-surface"></div>
                            <div class="mt-2 h-4 w-4/5 rounded-full bg-surface"></div>
                            <div class="mt-3 h-4 w-1/3 rounded-full bg-surface"></div>
                        </div>
                    {/each}
                </div>
            </section>
        {/snippet}

        {#await data.episodes}
            {@render loadingEpisodes()}
        {:then episodes}
            {#await data.artwork}
                {@render loadingEpisodes()}
            {:then artwork}
                {@const hasFiller = episodes.some((episode) => episode.type === 'filler')}
                {@const visibleEpisodes = hideFiller
                    ? episodes.filter((episode) => episode.type !== 'filler')
                    : episodes}
                <section id="anime-episode-list" class="px-2 py-7 sm:pb-12 lg:pb-16" aria-live="polite">
                    {#if episodes.length}
                        {#if hasFiller}
                            <div class="mb-5 flex justify-end">
                                <button
                                    type="button"
                                    aria-pressed={hideFiller}
                                    class="inline-flex min-h-10 items-center gap-2 px-3 text-xs font-semibold text-muted uppercase transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                    onclick={() => (hideFiller = !hideFiller)}
                                >
                                    {#if hideFiller}
                                        <EyeIcon size="1.1rem" weight="bold" aria-hidden="true" />
                                        Show filler
                                    {:else}
                                        <EyeSlashIcon size="1.1rem" weight="bold" aria-hidden="true" />
                                        Hide filler
                                    {/if}
                                </button>
                            </div>
                        {/if}
                        <div class="grid grid-cols-1 gap-x-5 gap-y-8 md:grid-cols-5 2xl:grid-cols-7">
                            {#each visibleEpisodes as episode}
                                <EpisodeGridCard
                                    episode={episode}
                                    title={data.anime.title}
                                    image={artwork?.selectedBackdrop?.url ?? null}
                                />
                            {/each}
                        </div>
                    {/if}
                </section>
            {/await}
        {/await}

        {#await data.franchise then franchise}
            {#if franchise?.entries.length}
                <FranchiseOrder order={franchise} currentAnimeId={data.anime.id} />
            {/if}
        {/await}
    </div>
</main>

<style>
    .anime-hero-metadata__tag:not(:first-child)::before {
        width: 0.25rem;
        height: 0.25rem;
        margin-inline: 0.25rem;
        display: inline-block;
        background-color: currentcolor;
        content: '';
        line-height: 1;
        vertical-align: middle;
        transform: rotate(45deg);
    }
</style>
