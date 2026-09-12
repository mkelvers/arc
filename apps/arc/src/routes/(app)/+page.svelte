<script lang="ts">
    import { m } from '$lib/i18n.svelte';
    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import Carousel from '$lib/components/ui/Carousel.svelte';
    import ContinueWatchingGrid from './_components/ContinueWatchingGrid.svelte';
    import HomeHero from './_components/HomeHero.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <title>{m.home_title()}</title>
    <meta name="description" content={m.home_description()} />
</svelte:head>

<main class="min-h-dvh bg-canvas text-foreground">
    <h1 class="sr-only">{m.home_title()}</h1>
    <div
        class="home-layout grid grid-cols-1 grid-rows-[auto] wide:has-[>_.continue-watching-section]:grid-rows-[auto_15rem] wide:has-[>_.continue-watching-section]:pb-8 hero:has-[>_.continue-watching-section]:grid-rows-[auto_16rem] hero:has-[>_.continue-watching-section]:pb-12 hero:has-[>section:first-child]:not-has-[>_.continue-watching-section]:grid-rows-[calc(100svh-16rem)] [&>section:first-child]:col-start-1 [&>section:first-child]:row-start-1"
    >
        <HomeHero highlights={data.highlights}></HomeHero>
        {#await data.continueWatching then anime}
            <ContinueWatchingGrid anime={anime}></ContinueWatchingGrid>
        {/await}
    </div>
    <section
        class="relative z-20 pb-10 [content-visibility:auto] [contain-intrinsic-size:24rem] sm:pb-12 lg:pb-16"
        aria-labelledby="new-this-season"
    >
        <h2 id="new-this-season" class="mb-5 px-4 text-xl font-bold sm:px-10 sm:text-2xl lg:px-16 2xl:px-16">
            {m.home_new_season()}
        </h2>

        {#if data.season.length}
            <Carousel controls class="min-w-0">
                {#snippet children({})}
                    <div
                        class="scrollbar-hidden flex gap-3 overscroll-x-contain px-4 pb-4 sm:gap-4 sm:px-10 lg:gap-7.5 lg:px-16 2xl:gap-7.5 2xl:px-16 hero:gap-6 hero:px-16"
                    >
                        {#each data.season as entry (entry.id)}
                            <div
                                class="min-w-0 shrink-0 grow-0 basis-[calc((100vw-2.75rem)/2)] min-[30em]:basis-[calc((100vw-4rem)/3)] min-[35.5em]:basis-[calc((100vw-4.75rem)/4)] sm:basis-[calc((100vw-7.75rem)/4)] lg:basis-[calc((100vw-17.375rem)/5)] 2xl:basis-[calc((100vw-19.25rem)/6)] hero:basis-[calc((100vw-16.875rem)/7)]"
                            >
                                <AnimeCard anime={entry} compact></AnimeCard>
                            </div>
                        {/each}
                    </div>
                {/snippet}
            </Carousel>
        {/if}
    </section>

    <section
        class="relative z-20 pb-10 [content-visibility:auto] [contain-intrinsic-size:24rem] sm:pb-12 lg:pb-16"
        aria-labelledby="most-popular-anime"
    >
        <h2 id="most-popular-anime" class="mb-5 px-4 text-xl font-bold sm:px-10 sm:text-2xl lg:px-16 2xl:px-16">
            {m.home_most_popular()}
        </h2>

        {#if data.popular.length}
            <Carousel controls class="min-w-0">
                {#snippet children({})}
                    <div
                        class="scrollbar-hidden flex gap-3 overscroll-x-contain px-4 pb-4 sm:gap-4 sm:px-10 lg:gap-7.5 lg:px-16 2xl:gap-7.5 2xl:px-16 hero:gap-6 hero:px-16"
                    >
                        {#each data.popular as entry (entry.id)}
                            <div
                                class="min-w-0 shrink-0 grow-0 basis-[calc((100vw-2.75rem)/2)] min-[30em]:basis-[calc((100vw-4rem)/3)] min-[35.5em]:basis-[calc((100vw-4.75rem)/4)] sm:basis-[calc((100vw-7.75rem)/4)] lg:basis-[calc((100vw-17.375rem)/5)] 2xl:basis-[calc((100vw-19.25rem)/6)] hero:basis-[calc((100vw-16.875rem)/7)]"
                            >
                                <AnimeCard anime={entry} compact></AnimeCard>
                            </div>
                        {/each}
                    </div>
                {/snippet}
            </Carousel>
        {/if}
    </section>
</main>
