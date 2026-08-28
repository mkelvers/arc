<script lang="ts">
    import CatalogListing from '../_components/CatalogListing.svelte';
    import type { PageProps } from './$types';
    import { m } from '$lib/paraglide/messages.js';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <title>Arc — {m.catalog_newly_added()}</title>
    <meta name="description" content={m.new_description()} />
</svelte:head>

<CatalogListing
    kind="new"
    initialAnime={data.anime}
    initialHasNextPage={data.hasNextPage}
    initialPage={data.page}
    loadedAt={data.loadedAt}
    filters={data.filters}
    paginationStrategy="eager"
/>
