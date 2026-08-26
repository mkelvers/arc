<script lang="ts">
    import CatalogListing from '../_components/CatalogListing.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <title>Arc — Most popular anime</title>
    <meta name="description" content="See the most popular anime available on Arc." />
</svelte:head>

<CatalogListing
    kind="popular"
    initialAnime={data.anime}
    initialHasNextPage={data.hasNextPage}
    initialPage={data.page}
    loadedAt={data.loadedAt}
/>
