<script lang="ts">
    import CatalogListing from '../_components/CatalogListing.svelte';
    import type { PageProps } from './$types';
    import { m } from '$lib/i18n.svelte';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <title>Arc — {m.catalog_most_popular()}</title>
    <meta name="description" content={m.popular_description()} />
</svelte:head>

<CatalogListing
    kind="popular"
    initialAnime={data.anime}
    initialHasNextPage={data.hasNextPage}
    initialPage={data.page}
    loadedAt={data.loadedAt}
    filters={data.filters}
    paginationStrategy="gated"
/>
