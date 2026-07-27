<script lang="ts">
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { XIcon } from 'phosphor-svelte';

    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import { RecentSearches } from '$lib/search/recent.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    const recent = new RecentSearches();
    let searchDraft = $state<string | null>(null);
    let requestedQuery = $state<string | null>(null);
    let currentRouteQuery = $state<string | null>(null);
    const routeQuery = $derived(data.query);
    const searchValue = $derived(searchDraft ?? routeQuery);

    onMount(() => recent.load());

    $effect(() => {
        if (currentRouteQuery === null) {
            currentRouteQuery = routeQuery;
            requestedQuery = routeQuery;
            return;
        }

        if (routeQuery === currentRouteQuery) {
            return;
        }

        const previousRouteQuery = currentRouteQuery;
        currentRouteQuery = routeQuery;

        if (
            searchDraft === null ||
            searchDraft.trim() === previousRouteQuery ||
            searchDraft.trim() === routeQuery
        ) {
            searchDraft = null;
        }
    });

    $effect(() => {
        const query = searchValue.trim();
        if (query === routeQuery || query === requestedQuery) {
            return;
        }

        const timeout = setTimeout(() => {
            requestedQuery = query;
            void goto(
                query ? `/search?q=${encodeURIComponent(query)}` : '/search',
                {
                    replaceState: true,
                    keepFocus: true,
                    noScroll: true,
                },
            );
        }, 300);

        return () => clearTimeout(timeout);
    });
</script>

<main class="min-h-dvh bg-canvas text-foreground">
    <section class="border-b border-border bg-header px-5 py-8 sm:px-10 sm:py-10 lg:px-16">
        <form action="/search" class="mx-auto max-w-6xl" role="search">
            <label for="anime-search" class="sr-only">Search anime</label>
            <!-- svelte-ignore a11y_autofocus -->
            <input
                id="anime-search"
                name="q"
                type="search"
                value={searchValue}
                placeholder="Search…"
                autocomplete="off"
                oninput={(event) => (searchDraft = event.currentTarget.value)}
                class="h-14 w-full border-b-2 border-accent bg-transparent px-0 text-2xl text-foreground outline-none placeholder:text-subtle sm:text-3xl"
                autofocus
            />
        </form>
    </section>

    <div class="mx-auto w-full max-w-6xl px-5 py-8 sm:px-10 sm:py-10 lg:px-0 lg:py-12">
        {#if data.query}
            <section aria-labelledby="search-results-title">
                <h1 id="search-results-title" class="mb-5 text-lg font-semibold">
                    Top results
                </h1>

                {#if data.results.length}
                    <div class="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 md:grid-cols-4 lg:grid-cols-5">
                        {#each data.results as result (result.id)}
                            <AnimeCard
                                anime={result}
                                watchlisted={data.watchlistedIds.includes(result.id)}
                                onselect={(anime) => recent.remember(anime)}
                            />
                        {/each}
                    </div>
                {:else}
                    <p class="text-sm text-muted">
                        No anime found for “{data.query}”.
                    </p>
                {/if}
            </section>
        {:else if recent.results.length}
            <section aria-labelledby="recent-results-title">
                <div class="mb-4 flex items-center justify-between gap-6">
                    <h1 id="recent-results-title" class="text-lg font-semibold">
                        Recent Search Results
                    </h1>
                    <button
                        type="button"
                        class="min-h-11 shrink-0 text-xs font-bold uppercase text-muted hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        onclick={() => recent.clear()}
                    >
                        Clear Recent
                    </button>
                </div>

                <ul class="flex flex-wrap gap-2">
                    {#each recent.results as result (result.id)}
                        <li class="flex min-w-0 max-w-full items-stretch bg-player-accent/30 text-xs font-semibold uppercase">
                            <a
                                href={result.href}
                                class="min-w-0 truncate px-3 py-3 hover:bg-player-accent/20 focus-visible:outline-1 focus-visible:outline-accent"
                            >
                                {result.title}
                            </a>
                            <button
                                type="button"
                                class="grid size-11 shrink-0 place-items-center border-l border-black/40 text-muted hover:bg-player-accent/20 hover:text-foreground focus-visible:outline-1 focus-visible:outline-accent"
                                aria-label={`Remove ${result.title} from recent search results`}
                                title="Remove"
                                onclick={() => recent.remove(result.id)}
                            >
                                <XIcon size="1.15rem" weight="bold" aria-hidden="true" />
                            </button>
                        </li>
                    {/each}
                </ul>
            </section>
        {/if}
    </div>
</main>
