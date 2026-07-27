<script lang="ts">
    import { enhance } from '$app/forms';
    import { onMount } from 'svelte';
    import {
        BookmarkSimpleIcon,
        CaretLeftIcon,
        CaretRightIcon,
        PauseIcon,
        PlayIcon,
        StarIcon,
    } from 'phosphor-svelte';

    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    let activeHighlight = $state(0);
    let manualPause = $state(false);
    let interactionPause = $state(false);
    let seasonRail = $state<HTMLDivElement>();
    let seasonCanScrollLeft = $state(false);
    let seasonCanScrollRight = $state(false);

    function selectHighlight(index: number) {
        const count = data.highlights.length;
        if (!count) return;

        activeHighlight = (index + count) % count;
    }

    function moveSeasonRail(direction: -1 | 1) {
        seasonRail?.scrollBy({
            left: direction * seasonRail.clientWidth * 0.82,
            behavior: 'smooth',
        });
    }

    function updateSeasonRail() {
        if (!seasonRail) return;

        seasonCanScrollLeft = seasonRail.scrollLeft > 2;
        seasonCanScrollRight =
            seasonRail.scrollLeft + seasonRail.clientWidth <
            seasonRail.scrollWidth - 2;
    }

    $effect(() => {
        if (!seasonRail) return;

        updateSeasonRail();
        const observer = new ResizeObserver(updateSeasonRail);
        observer.observe(seasonRail);

        return () => observer.disconnect();
    });

    onMount(() => {
        if (
            data.highlights.length < 2 ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            return;
        }

        const interval = window.setInterval(() => {
            if (!manualPause && !interactionPause) {
                selectHighlight(activeHighlight + 1);
            }
        }, 8_000);

        return () => window.clearInterval(interval);
    });
</script>

<svelte:head>
    <title>Arc — Watch anime</title>
    <meta
        name="description"
        content="Discover the anime everyone is watching and explore popular new releases this season."
    />
</svelte:head>

<main class="min-h-dvh bg-canvas text-foreground">
    {#if data.highlights.length}
        <section
            class="relative isolate h-[calc(100svh+6rem)] min-h-180 overflow-hidden bg-black"
            aria-roledescription="carousel"
            aria-label="Trending anime"
            onmouseenter={() => (interactionPause = true)}
            onmouseleave={() => (interactionPause = false)}
            onfocusin={() => (interactionPause = true)}
            onfocusout={() => (interactionPause = false)}
        >
            {#each data.highlights as anime, index (anime.id)}
                {#if index === activeHighlight}
                    <article
                        class="home-hero-slide absolute inset-0 grid grid-cols-1 grid-rows-1 overflow-hidden"
                    >
                        <a
                            href={anime.href}
                            class="col-start-1 row-start-1 block focus-visible:outline-2 focus-visible:outline-white"
                            aria-label={`View ${anime.title}`}
                        >
                            <img
                                src={anime.image}
                                alt=""
                                class="size-full object-cover object-center"
                                loading={index === 0 ? 'eager' : 'lazy'}
                                fetchpriority={index === 0 ? 'high' : 'auto'}
                            />
                        </a>

                        <div class="z-20 col-start-1 row-start-1 min-w-0 self-end px-5 pb-72 sm:px-10 lg:px-16 2xl:self-start 2xl:pt-[calc((100svh-3.5rem)/2+2rem)] 2xl:pb-0">
                            {#if anime.logoUrl}
                                <a
                                    href={anime.href}
                                    class="block w-fit focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                                    aria-label={`View ${anime.title}`}
                                >
                                    <img
                                        src={anime.logoUrl}
                                        alt={anime.title}
                                        style:height={`clamp(${5 * anime.logoSize / 100}rem, ${6.4 * anime.logoSize / 100}vw, ${8 * anime.logoSize / 100}rem)`}
                                        class="max-h-28 max-w-[75vw] object-contain object-left sm:max-w-md lg:max-w-xl 2xl:max-h-40 2xl:max-w-2xl"
                                    />
                                </a>
                            {:else}
                                <h1 class="sr-only">
                                    {anime.title}
                                </h1>
                            {/if}

                            <p class="mt-7 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-white/78 sm:text-sm 2xl:mt-8 2xl:text-base">
                                <span>{anime.format}</span>
                                {#if anime.audioLabel}
                                    <span aria-hidden="true">•</span>
                                    <span>{anime.audioLabel}</span>
                                {/if}
                                {#if anime.score}
                                    <span aria-hidden="true">•</span>
                                    <span class="inline-flex items-center gap-1">
                                        {anime.score}%
                                        <StarIcon size="0.95em" weight="fill" aria-hidden="true" />
                                        <span class="sr-only">AniList score</span>
                                    </span>
                                {/if}
                                {#if anime.genres.length}
                                    <span aria-hidden="true">•</span>
                                    <span>{anime.genres.slice(0, 3).join(', ')}</span>
                                {/if}
                            </p>

                            {#if anime.description}
                                <p class="mt-4 line-clamp-3 max-w-2xl text-sm leading-6 text-white/88 sm:text-base 2xl:max-w-3xl 2xl:text-lg 2xl:leading-7">
                                    {anime.description}
                                </p>
                            {/if}

                            <div class="mt-7 flex flex-wrap items-center gap-2 text-xs font-bold text-accent sm:text-sm">
                                <a
                                    href={anime.watchHref}
                                    class="inline-flex min-h-12 items-center gap-2.5 bg-accent px-5 text-on-accent transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white 2xl:min-h-14 2xl:px-7 2xl:text-base"
                                >
                                    <PlayIcon size="1.45rem" weight="fill" aria-hidden="true" />
                                    START WATCHING
                                </a>
                                <form method="POST" action="?/watchlist" use:enhance>
                                    <input type="hidden" name="animeId" value={anime.id} />
                                    <button
                                        type="submit"
                                        class:bg-accent={data.watchlistedIds.includes(anime.id)}
                                        class:text-on-accent={data.watchlistedIds.includes(anime.id)}
                                        class="grid size-12 shrink-0 place-items-center border border-accent transition-colors hover:bg-accent hover:text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white 2xl:size-14"
                                        aria-label={data.watchlistedIds.includes(anime.id)
                                            ? `Remove ${anime.title} from Plan to Watch`
                                            : `Add ${anime.title} to Plan to Watch`}
                                        aria-pressed={data.watchlistedIds.includes(anime.id)}
                                        title={data.watchlistedIds.includes(anime.id) ? 'Remove from Plan to Watch' : 'Add to Plan to Watch'}
                                    >
                                        <BookmarkSimpleIcon
                                            size="1.65rem"
                                            weight={data.watchlistedIds.includes(anime.id) ? 'fill' : 'regular'}
                                            aria-hidden="true"
                                        />
                                    </button>
                                </form>
                            </div>

                            {#if data.highlights.length > 1}
                                <div class="mt-4 flex items-center gap-2 2xl:mt-5">
                                    <button
                                        type="button"
                                        class="grid size-8 place-items-center text-white/70 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                                        aria-label={manualPause ? 'Play carousel' : 'Pause carousel'}
                                        aria-pressed={manualPause}
                                        onclick={() => (manualPause = !manualPause)}
                                    >
                                        {#if manualPause}
                                            <PlayIcon size="1rem" weight="fill" aria-hidden="true" />
                                        {:else}
                                            <PauseIcon size="1rem" weight="fill" aria-hidden="true" />
                                        {/if}
                                    </button>
                                    {#each data.highlights as item, itemIndex (item.id)}
                                        <button
                                            type="button"
                                            class={`h-2 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${itemIndex === activeHighlight ? 'w-8 bg-white' : 'w-3 bg-white/45'}`}
                                            aria-label={`Show ${item.title}`}
                                            aria-current={itemIndex === activeHighlight ? 'true' : undefined}
                                            onclick={() => selectHighlight(itemIndex)}
                                        >
                                            <span class="sr-only">Show {item.title}</span>
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </article>
                {/if}
            {/each}

            {#if data.highlights.length > 1}
                <button
                    type="button"
                    class="absolute top-[calc((100svh-3.5rem)/2)] left-2 z-30 grid size-11 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white sm:left-5"
                    aria-label="Previous anime"
                    onclick={() => selectHighlight(activeHighlight - 1)}
                >
                    <CaretLeftIcon size="1.7rem" weight="bold" aria-hidden="true" />
                </button>
                <button
                    type="button"
                    class="absolute top-[calc((100svh-3.5rem)/2)] right-2 z-30 grid size-11 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white sm:right-5"
                    aria-label="Next anime"
                    onclick={() => selectHighlight(activeHighlight + 1)}
                >
                    <CaretRightIcon size="1.7rem" weight="bold" aria-hidden="true" />
                </button>

            {/if}
        </section>
    {/if}

    <section
        class={`relative z-20 px-5 pt-10 pb-12 sm:px-10 sm:pt-12 sm:pb-14 lg:px-16 lg:pt-16 lg:pb-18 ${data.highlights.length ? '-mt-72' : ''}`}
        aria-labelledby="new-this-season"
    >
        <h2 id="new-this-season" class="mb-5 text-xl font-bold sm:text-2xl">
            New Anime from the Current Season
        </h2>

        {#if data.season.length}
            <div class="relative">
                <div
                    bind:this={seasonRail}
                    onscroll={updateSeasonRail}
                    class="-mx-2 grid snap-x snap-mandatory grid-flow-col auto-cols-franchise gap-2 overflow-x-auto overscroll-x-contain scroll-smooth sm:auto-cols-[30%] sm:gap-3 md:auto-cols-[23%] lg:auto-cols-[18%] xl:auto-cols-[15%]"
                >
                    {#each data.season as anime (anime.id)}
                        <div class="min-w-0 snap-start">
                            <AnimeCard
                                {anime}
                                compact
                                watchlisted={data.watchlistedIds.includes(anime.id)}
                            />
                        </div>
                    {/each}
                </div>

                {#if seasonCanScrollLeft}
                    <button
                        type="button"
                        class="absolute top-[42%] -left-3 z-30 grid size-12 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white"
                        aria-label="Scroll season anime left"
                        onclick={() => moveSeasonRail(-1)}
                    >
                        <CaretLeftIcon size="1.65rem" weight="bold" aria-hidden="true" />
                    </button>
                {/if}
                {#if seasonCanScrollRight}
                    <button
                        type="button"
                        class="absolute top-[42%] -right-3 z-30 grid size-12 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white"
                        aria-label="Scroll season anime right"
                        onclick={() => moveSeasonRail(1)}
                    >
                        <CaretRightIcon size="1.65rem" weight="bold" aria-hidden="true" />
                    </button>
                {/if}
            </div>
        {:else}
            <p class="text-sm text-muted">
                No seasonal anime are available right now.
            </p>
        {/if}
    </section>
</main>
