<script lang="ts">
    import { BookmarkSimpleIcon } from 'phosphor-svelte';

    import WatchlistCard from '$lib/components/WatchlistCard.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    const filters = [
        { value: 'all', label: 'All' },
        { value: 'watching', label: 'Watching' },
        { value: 'plan_to_watch', label: 'Plan to Watch' },
        { value: 'completed', label: 'Completed' },
        { value: 'dropped', label: 'Dropped' },
    ] as const;

    type FilterValue = (typeof filters)[number]['value'];

    function watchlistHref(state: FilterValue) {
        return state === 'all' ? '/watchlist' : `/watchlist?state=${state}`;
    }

    const visibleEntries = $derived(
        data.selectedState === 'all'
            ? data.entries
            : data.entries.filter(
                  ({ state }) => state === data.selectedState,
              ),
    );
    const selectedLabel = $derived(
        filters.find(({ value }) => value === data.selectedState)?.label ?? 'All',
    );
</script>

<svelte:head>
    <title>My Watchlist — Arc</title>
</svelte:head>

<main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
    <div class="mx-auto w-full max-w-6xl px-5 py-10 sm:px-10 sm:py-12 lg:px-0 lg:py-14">
        <header class="flex items-center justify-center gap-2">
            <BookmarkSimpleIcon size="1.7rem" weight="regular" aria-hidden="true" />
            <h1 class="text-2xl font-semibold">My Watchlist</h1>
        </header>

        <nav class="mt-8 overflow-x-auto border-b border-border sm:mt-10" aria-label="Watchlist states">
            <ul class="-mb-px flex min-w-max gap-3 sm:gap-6">
                {#each filters as filter}
                    <li>
                        <a
                            href={watchlistHref(filter.value)}
                            class:border-accent={data.selectedState === filter.value}
                            class:border-transparent={data.selectedState !== filter.value}
                            class:text-foreground={data.selectedState === filter.value}
                            class="inline-flex h-11 items-center border-b-2 text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-current={data.selectedState === filter.value ? 'page' : undefined}
                        >
                            {filter.label}
                        </a>
                    </li>
                {/each}
            </ul>
        </nav>

        {#if data.entries.length === 0}
            <section class="mt-10 grid min-h-96 place-items-center border border-dashed border-border px-6 py-12 text-center sm:mt-12">
                <div class="flex max-w-sm flex-col items-center">
                    <img
                        src="/images/watchlist-empty.png"
                        alt=""
                        width="480"
                        height="480"
                        class="w-52 sm:w-56"
                    />
                    <h2 class="mt-1 text-lg font-semibold">Your watchlist needs some love.</h2>
                    <p class="mt-2 text-sm text-muted">Start saving anime to see them here.</p>
                    <a
                        href="/"
                        class="mt-6 bg-accent px-5 py-3 text-xs font-bold uppercase text-on-accent transition-opacity hover:opacity-85 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        Browse anime
                    </a>
                </div>
            </section>
        {:else if visibleEntries.length === 0}
            <section class="mt-8 grid min-h-56 place-items-center border border-dashed border-border px-6 py-10 text-center">
                <div>
                    <h2 class="text-lg font-semibold">No results, but don’t give up</h2>
                    <p class="mt-2 text-sm text-muted">There’s nothing in {selectedLabel} yet.</p>
                    <a
                        href="/watchlist"
                        class="mt-6 inline-block text-xs font-bold uppercase text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        View all
                    </a>
                </div>
            </section>
        {:else}
            <section class="mt-8" aria-label={`${selectedLabel} anime`}>
                <div class="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 md:grid-cols-4 lg:grid-cols-5">
                    {#each visibleEntries as entry (entry.id)}
                        <WatchlistCard
                            animeId={entry.id}
                            href={entry.href}
                            image={entry.image}
                            title={entry.title}
                        />
                    {/each}
                </div>
            </section>
        {/if}
    </div>
</main>
