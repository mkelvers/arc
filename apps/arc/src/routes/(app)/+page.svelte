<script lang="ts">
    import AnimeRail from './_components/AnimeRail.svelte';
    import ContinueWatchingGrid from './_components/ContinueWatchingGrid.svelte';
    import HomeHero from './_components/HomeHero.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <title>Arc — Watch anime</title>
    <meta
        name="description"
        content="Discover the anime everyone is watching and explore popular new releases this season."
    />
</svelte:head>

<main class="min-h-dvh bg-canvas text-foreground">
    <div
        class="grid grid-cols-1 grid-rows-[auto_auto] min-[1440px]:grid-rows-[auto_13rem] [&>section:first-child]:col-start-1 [&>section:first-child]:row-start-1"
    >
        <HomeHero highlights={data.highlights} />
        {#await data.continueWatching then anime}
            <ContinueWatchingGrid anime={anime} />
        {/await}
    </div>
    <AnimeRail
        anime={data.season}
        heading="New Anime from the Current Season"
        headingId="new-this-season"
        emptyMessage="No seasonal anime are available right now."
    />
    <AnimeRail
        anime={data.popular}
        heading="Most Popular Anime"
        headingId="most-popular-anime"
        emptyMessage="No popular anime are available right now."
        topSpacing={false}
    />
</main>
