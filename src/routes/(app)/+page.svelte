<script lang="ts">
  import AnimeRail from '$lib/components/AnimeRail.svelte';
  import ContinueWatchingGrid from '$lib/components/ContinueWatchingGrid.svelte';
  import HomeHero from '$lib/components/HomeHero.svelte';
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
  <HomeHero highlights={data.highlights} />
  <AnimeRail
    anime={data.season}
    heading="New Anime from the Current Season"
    headingId="new-this-season"
    emptyMessage="No seasonal anime are available right now."
    overlap={Boolean(data.highlights.length)}
  />
  <AnimeRail
    anime={data.popular}
    heading="Most Popular Anime"
    headingId="most-popular-anime"
    emptyMessage="No popular anime are available right now."
    topSpacing={false}
  />
  {#await data.continueWatching then anime}
    <ContinueWatchingGrid anime={anime} />
  {/await}
</main>
