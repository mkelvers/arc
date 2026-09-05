<script lang="ts">
    import { goto } from '$app/navigation';

    import emptyArtwork from '$lib/assets/watchlist-empty.png';
    import filteredEmptyArtwork from '$lib/assets/watchlist-filter-empty.png';
    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import EmptyState from '$lib/components/ui/EmptyState.svelte';
    import Button from '$lib/components/ui/button/button.svelte';
    import { m } from '$lib/i18n.svelte';
    import { watchlist } from '$lib/watchlist.svelte';
    import type { PageData } from '../$types';
    import WatchlistControls from './WatchlistControls.svelte';
    import WatchlistPendingCard from './WatchlistPendingCard.svelte';

    type PageResult = Awaited<PageData['page']>;
    type Page = Extract<PageResult, { status: 'success' }>['data'];
    type Props = { data: Page & Pick<PageData, 'selection'> };

    let { data }: Props = $props();

    async function updateSelection(patch: Partial<typeof data.selection>) {
        const selection = { ...data.selection, ...patch };
        const query = new URLSearchParams();

        if (selection.state !== 'all') query.set('state', selection.state);
        if (selection.sort !== 'updated') query.set('sort', selection.sort);
        if (selection.order !== 'newest') query.set('order', selection.order);
        if (selection.language !== 'all') query.set('language', selection.language);
        if (selection.media !== 'all') query.set('media', selection.media);
        if (selection.type !== 'all') query.set('type', selection.type);

        await goto(query.size ? `/watchlist?${query}` : '/watchlist', {
            keepFocus: true,
            noScroll: true,
        });
    }
</script>

<main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
    <div class="mx-auto w-full max-w-384 px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
        <h1 class="text-2xl font-semibold">{m.watchlist_title()}</h1>

        <WatchlistControls
            selection={data.selection}
            totalEntries={data.totalEntries}
            onselect={updateSelection}
        />

        {#if data.totalEntries === 0}
            <EmptyState
                artwork={emptyArtwork}
                artworkWidth={566}
                artworkHeight={720}
                id="empty-watchlist-title"
                title={m.watchlist_empty_title()}
                body={m.watchlist_empty_body()}
            >
                {#snippet action()}
                    <Button
                        variant="default"
                        size="lg"
                        href="/"
                        class="text-xs font-bold uppercase active:scale-[0.97]"
                    >
                        Explore Anime
                    </Button>
                {/snippet}
            </EmptyState>
        {:else}
            <section class="mt-8" aria-labelledby="watchlist-results-title">
                <h2 id="watchlist-results-title" class="sr-only">{m.watchlist_title()}</h2>
                {#if data.entries.length === 0}
                    <EmptyState
                        artwork={filteredEmptyArtwork}
                        artworkWidth={622}
                        artworkHeight={640}
                        id="empty-filter-message"
                        body={m.watchlist_filtered_empty()}
                    >
                        {#snippet action()}
                            <Button
                                variant="default"
                                size="lg"
                                class="text-xs font-bold uppercase active:scale-[0.97]"
                                onclick={() => updateSelection({ state: 'all' })}
                            >
                                {m.watchlist_view_all()}
                            </Button>
                        {/snippet}
                    </EmptyState>
                {:else}
                    <div
                        class="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-7.5 lg:gap-y-12 xl:grid-cols-6 2xl:grid-cols-7"
                    >
                        {#each data.entries.filter((entry) => !watchlist.loaded || watchlist.state(entry.id)) as entry (entry.id)}
                            {#if entry.pendingMetadata}
                                <WatchlistPendingCard anime={entry} />
                            {:else}
                                <AnimeCard anime={entry} />
                            {/if}
                        {/each}
                    </div>
                {/if}
            </section>
        {/if}
    </div>
</main>
