<script lang="ts">
    import Dropdown from '$lib/components/Dropdown.svelte';
    import EpisodeList from '$lib/components/EpisodeList.svelte';
    import FranchiseOrder from '$lib/components/FranchiseOrder.svelte';
    import { enhance } from '$app/forms';
    import type { PageProps } from './$types';
    import {
        CaretDownIcon,
        BookmarkSimpleIcon,
        CheckIcon,
        DotsThreeVerticalIcon,
        PencilSimpleIcon,
        PlayIcon,
    } from 'phosphor-svelte';

    let { data }: PageProps = $props();

    let detailsExpanded = $state(false);

    const watchlistStates = [
        { value: 'watching', label: 'Watching' },
        { value: 'plan_to_watch', label: 'Plan to Watch' },
        { value: 'completed', label: 'Completed' },
        { value: 'dropped', label: 'Dropped' },
    ] as const;
</script>

<svelte:head>
    <title>Watch {data.anime.title} - Arc</title>
</svelte:head>

<main class="bg-canvas text-foreground">
    <section class="min-h-dvh">
        <figure
            class="anime-hero relative z-10 grid h-dvh min-h-120 max-h-192 grid-cols-1 grid-rows-1 bg-black before:pointer-events-none before:col-start-1 before:row-start-1 before:z-10 before:h-full after:pointer-events-none after:col-start-1 after:row-start-1 after:z-10 after:h-full sm:min-h-150 lg:min-h-175 lg:max-h-300"
        >
            {#await data.artwork then artwork}
                {#if artwork?.selectedBackdrop}
                    <img
                        src={artwork.selectedBackdrop.url}
                        alt={data.anime.title}
                        class="z-0 col-start-1 row-start-1 size-full object-cover object-[center_0%]"
                    />
                {/if}
            {/await}

            <div class="z-30 col-start-1 row-start-1 mt-3 mr-3 self-start justify-self-end font-bold sm:mt-5 sm:mr-8 lg:mr-12">
                <Dropdown
                    id="more-options"
                    items={[
                        { label: 'View Media Options', href: `/anime/${data.anime.id}/media` }
                    ]}
                >
                    {#snippet trigger()}
                        <span class="flex min-h-11 items-center gap-3 text-sm leading-none">
                            <DotsThreeVerticalIcon size="1.5rem" weight="bold" aria-hidden="true" />
                            <span>MORE</span>
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
                                style:height={`clamp(${5 * artwork.logoSize / 100}rem, ${5.7 * artwork.logoSize / 100}vw, ${6.25 * artwork.logoSize / 100}rem)`}
                                class="max-h-24 max-w-md object-contain object-left sm:max-h-32 lg:max-h-none lg:max-w-none"
                            />
                        {:else if !artwork}
                            <h1 class="max-w-3xl text-4xl leading-tight font-bold text-white sm:text-5xl lg:text-6xl">
                                {data.anime.title}
                            </h1>
                        {/if}
                    {/await}
                </div>

                <p class="mt-8 text-sm text-muted sm:mt-10 lg:mt-11 lg:text-base">
                    <span class="font-normal">{data.anime.format}</span>
                    {#await data.audioLabel then audioLabel}
                        {#if audioLabel}
                            <span class="mx-1" aria-hidden="true">•</span>
                            <span>{audioLabel}</span>
                        {/if}
                    {/await}
                    <span class="mx-1" aria-hidden="true">•</span>
                    {#each data.anime.genres as genre, index}
                        <a class="underline underline-offset-2" href="/">{genre}</a>{index < data.anime.genres.length - 1 ? ', ' : ''}
                    {/each}
                </p>

                <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm sm:text-base lg:mt-3.5 lg:gap-2.5 lg:text-base">
                    <span class="flex items-center gap-0.5 text-muted" aria-label="5 out of 5 stars">
                        {#each Array(5) as _}
                            <svg class="size-6 fill-current sm:size-7" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m12 2 2.85 6.59L22 9.27 16.55 14l1.63 7L12 17.27 5.82 21l1.63-7L2 9.27l7.15-.68z" />
                            </svg>
                        {/each}
                    </span>
                    <span class="hidden text-border-strong sm:inline" aria-hidden="true">|</span>
                    <strong>AniList score: {data.anime.score}%</strong>
                    <CaretDownIcon size="0.9em" weight="fill" aria-hidden="true" />
                </div>

                <div class="mt-7 flex items-center gap-2 text-xs font-bold text-accent sm:text-sm lg:mt-8 lg:gap-2.5">
                    {#await data.episodes}
                        <a
                            href="#anime-episode-list"
                            class="flex min-h-11 items-center gap-2.5 bg-accent px-4 text-on-accent sm:px-6 lg:h-12"
                        >
                            <PlayIcon size="1.55em" weight="bold" aria-hidden="true" />
                            VIEW EPISODES
                        </a>
                    {:then episodes}
                        <a
                            href={episodes[0]?.href ?? '#anime-episode-list'}
                            class="flex min-h-11 items-center gap-2.5 bg-accent px-4 text-on-accent sm:px-6 lg:h-12"
                        >
                            <PlayIcon size="1.55em" weight="bold" aria-hidden="true" />
                            START WATCHING E1
                        </a>
                    {/await}
                    <form method="POST" action="?/watchlist" use:enhance>
                        <button
                            type="submit"
                            class="grid size-11 shrink-0 place-items-center border border-accent text-accent transition-colors lg:size-12"
                            aria-label={data.watchlistState ? 'Remove from watchlist' : 'Add to Plan to Watch'}
                            aria-pressed={Boolean(data.watchlistState)}
                            title={data.watchlistState ? 'Remove from watchlist' : 'Add to Plan to Watch'}
                        >
                            <BookmarkSimpleIcon
                                size="1.65em"
                                weight={data.watchlistState ? 'fill' : 'regular'}
                                aria-hidden="true"
                            />
                        </button>
                    </form>
                    <Dropdown
                        id="watchlist-status"
                        ariaLabel="Change watchlist status"
                        menuAlign="start"
                        menuClass="w-52 pt-2"
                        triggerClass="grid size-11 shrink-0 cursor-pointer place-items-center transition-opacity hover:opacity-70 peer-focus-visible:opacity-70 lg:size-12"
                    >
                        {#snippet trigger()}
                            <PencilSimpleIcon
                                size="1.65em"
                                weight="regular"
                                aria-hidden="true"
                            />
                        {/snippet}
                        {#snippet content()}
                            <div role="menu" aria-label="Watchlist statuses">
                                {#each watchlistStates as status}
                                    <form method="POST" action="?/watchlist" use:enhance>
                                        <input type="hidden" name="state" value={status.value} />
                                        <button
                                            type="submit"
                                            role="menuitem"
                                            class:bg-panel-hover={data.watchlistState === status.value}
                                            class:text-foreground={data.watchlistState === status.value}
                                            class="flex w-full items-center justify-between gap-4 px-5 py-3 text-left text-sm leading-tight font-normal whitespace-nowrap text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                        >
                                            <span>{status.label}</span>
                                            {#if data.watchlistState === status.value}
                                                <CheckIcon size="1rem" weight="bold" aria-hidden="true" />
                                            {/if}
                                        </button>
                                    </form>
                                {/each}

                                {#if data.watchlistState}
                                    <div class="mt-2 border-t border-border pt-2">
                                        <form method="POST" action="?/remove" use:enhance>
                                            <input
                                                type="hidden"
                                                name="animeId"
                                                value={data.anime.id}
                                            />
                                            <button
                                                type="submit"
                                                role="menuitem"
                                                class="block w-full px-5 py-3 text-left text-sm leading-tight font-normal whitespace-nowrap text-status-error hover:bg-panel-hover focus:bg-panel-hover focus:outline-none"
                                            >
                                                Remove from watchlist
                                            </button>
                                        </form>
                                    </div>
                                {/if}
                            </div>
                        {/snippet}
                    </Dropdown>
                </div>
            </div>
        </figure>

        <div class="border-b border-border px-5 pt-7 sm:px-10 lg:px-16 lg:pt-8">
            <section
                id="anime-details"
                class={`grid min-w-0 grid-cols-1 gap-8 overflow-hidden text-xs leading-5 text-muted md:grid-cols-2 md:gap-12 lg:gap-28 lg:text-sm lg:leading-6 ${detailsExpanded ? 'max-h-320' : 'details-fade max-h-24'}`}
            >
                <p class="max-w-prose text-foreground md:max-w-full">{data.anime.description}</p>
                <div class="space-y-3">
                    <p><strong class="font-normal text-foreground">Production:</strong> {data.anime.studios.join(', ')}</p>
                    <p><strong class="font-normal text-foreground">Key staff:</strong> {data.anime.staff}</p>
                    <p><strong class="font-normal text-foreground">Rankings:</strong> {data.anime.rankings.join(', ')}</p>
                    <p><strong class="font-normal text-foreground">Audience:</strong> {data.anime.members} members, {data.anime.favourites} favorites</p>
                    <p><strong class="font-normal text-foreground">Themes:</strong> {data.anime.themes.join(', ')}</p>
                    <p>
                        <strong class="font-normal text-foreground">Genres:</strong>
                        {#each data.anime.genres as genre, index}
                            <a class="underline underline-offset-2" href="/">{genre}</a>{index < data.anime.genres.length - 1 ? ', ' : ''}
                        {/each}
                    </p>
                </div>
            </section>

            <button
                type="button"
                class="min-h-11 text-xs font-semibold text-accent"
                aria-expanded={detailsExpanded}
                aria-controls="anime-details"
                onclick={() => (detailsExpanded = !detailsExpanded)}
            >
                {detailsExpanded ? 'FEWER DETAILS' : 'MORE DETAILS'}
            </button>
        </div>
    </section>

    <div class="px-5 sm:px-10 lg:px-16">
        {#await data.episodes then episodes}
            {#await data.artwork then artwork}
                <EpisodeList
                    {episodes}
                    title={data.anime.title}
                    image={artwork?.selectedBackdrop?.url ?? null}
                />
            {/await}
        {/await}

        {#await data.franchise then franchise}
            {#if franchise?.entries.length}
                <FranchiseOrder
                    order={franchise}
                    currentAnimeId={data.anime.id}
                />
            {/if}
        {/await}
    </div>
</main>
