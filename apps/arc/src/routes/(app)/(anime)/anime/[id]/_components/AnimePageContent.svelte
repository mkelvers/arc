<script lang="ts">
    import type { PageData } from '../$types';
    import AnimePageView from './AnimePageView.svelte';

    type PageResult = Awaited<PageData['page']>;
    type Props = { data: Extract<PageResult, { status: 'success' }>['data'] };

    let { data }: Props = $props();
</script>

{#key data.anime.id}
    <AnimePageView data={data} />
{/key}
