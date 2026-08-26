<script lang="ts">
    import { m } from '$lib/paraglide/messages.js';
    import AnimeRail from './_components/AnimeRail.svelte';
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
    <div
        class="home-layout grid grid-cols-1 grid-rows-[auto] wide:has-[>_.continue-watching-section]:grid-rows-[auto_15rem] wide:has-[>_.continue-watching-section]:pb-8 hero:has-[>_.continue-watching-section]:grid-rows-[auto_16rem] hero:has-[>_.continue-watching-section]:pb-12 hero:has-[>section:first-child]:not-has-[>_.continue-watching-section]:grid-rows-[calc(100svh-16rem)] [&>section:first-child]:col-start-1 [&>section:first-child]:row-start-1"
    >
        <HomeHero highlights={data.highlights} />
        {#await data.continueWatching then anime}
            <ContinueWatchingGrid anime={anime} />
        {/await}
    </div>
    <AnimeRail
        anime={data.season}
        heading={m.home_new_season()}
        headingId="new-this-season"
        emptyMessage={m.home_no_season()}
        topSpacing={false}
    />
    <AnimeRail
        anime={data.popular}
        heading={m.home_most_popular()}
        headingId="most-popular-anime"
        emptyMessage={m.home_no_popular()}
        topSpacing={false}
    />
</main>
