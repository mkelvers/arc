<script lang="ts">
    import { afterNavigate, goto } from '$app/navigation';
    import { onMount, untrack } from 'svelte';
    import { XIcon } from 'phosphor-svelte';

    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import Tooltip from '$lib/components/Tooltip.svelte';
    import { RecentSearches } from './recent.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    const recent = new RecentSearches();
    let query = $state(untrack(() => data.query));

    onMount(() => recent.load());

    afterNavigate(({ type }) => {
        if (type === 'popstate') {
            query = data.query;
        }
    });

    $effect(() => {
        const next = query.trim();
        if (next === data.query) {
            return;
        }

        const timeout = setTimeout(() => {
            void goto(
                next ? `/search?q=${encodeURIComponent(next)}` : '/search',
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
                placeholder="Search…"
                autocomplete="off"
                bind:value={query}
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
                            <Tooltip text="Remove">
                                <button
                                    type="button"
                                    class="grid size-11 shrink-0 place-items-center border-l border-black/40 text-muted hover:bg-player-accent/20 hover:text-foreground focus-visible:outline-1 focus-visible:outline-accent"
                                    aria-label={`Remove ${result.title} from recent search results`}
                                    onclick={() => recent.remove(result.id)}
                                >
                                    <XIcon size="1.15rem" weight="bold" aria-hidden="true" />
                                </button>
                            </Tooltip>
                        </li>
                    {/each}
                </ul>
            </section>
        {/if}
    </div>
</main>
