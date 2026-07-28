<script lang="ts">
    import ContinueWatchingGrid from '$lib/components/ContinueWatchingGrid.svelte';
    import HomeHero from '$lib/components/HomeHero.svelte';
    import SeasonRail from '$lib/components/SeasonRail.svelte';
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
    <HomeHero
        highlights={data.highlights}
        watchlistedIds={data.watchlistedIds}
    />
    <SeasonRail
        anime={data.season}
        overlap={Boolean(data.highlights.length)}
        watchlistedIds={data.watchlistedIds}
    />
    {#await data.continueWatching then anime}
        <ContinueWatchingGrid {anime} />
    {/await}
</main>
