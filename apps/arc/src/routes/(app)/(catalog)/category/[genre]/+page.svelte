<script lang="ts">
    import CatalogListing from '../../shows/_components/CatalogListing.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <title>Arc — {data.genre}</title>
    <meta name="description" content={`Popular anime in the ${data.genre} genre.`} />
</svelte:head>

<CatalogListing
    kind="popular"
    heading={data.genre}
    initialAnime={data.anime}
    initialHasNextPage={data.hasNextPage}
    initialPage={data.page}
    loadedAt={data.loadedAt}
    filters={data.filters}
    paginationStrategy="gated"
/>
