<script lang="ts">
    import CatalogListing from '../_components/CatalogListing.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <title>Arc — Newly added anime</title>
    <meta name="description" content="See anime newly added to Arc, grouped by when they arrived." />
</svelte:head>

<CatalogListing
    kind="new"
    initialAnime={data.anime}
    initialHasNextPage={data.hasNextPage}
    initialPage={data.page}
    loadedAt={data.loadedAt}
/>
