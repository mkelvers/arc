<script lang="ts">
    import { afterNavigate, replaceState } from '$app/navigation';
    import { onMount, untrack } from 'svelte';
    import { XIcon } from 'phosphor-svelte';

    import { distinctSearchArtwork, AnimeSearchResultSchema } from '@arc/shared/search';
    import emptyArtwork from '$lib/assets/search-empty.png';
    import EmptyState from '$lib/components/ui/EmptyState.svelte';
    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import Tooltip from '$lib/components/ui/Tooltip.svelte';
    import SearchResultsGroup from './_components/SearchResultsGroup.svelte';
    import { RecentSearches } from './recent.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    const recent = new RecentSearches();
    let searchInput: HTMLInputElement | null = null;
    let query = $state(untrack(() => data.query));
    let searchState = $state({
        query: untrack(() => data.query),
        results: untrack(() => data.results),
        failed: false,
    });
    const loading = $derived(query.trim() !== searchState.query);

    const topResults = $derived(
        distinctSearchArtwork(
            searchState.results.filter(({ format }) => format !== 'MUSIC'),
            4
        )
    );
    const resultSections = $derived([
        {
            id: 'series-results',
            title: 'Series',
            results: searchState.results.filter(({ format }) => format !== 'MOVIE' && format !== 'MUSIC'),
        },
        {
            id: 'movie-results',
            title: 'Movies',
            results: searchState.results.filter(({ format }) => format === 'MOVIE'),
        },
    ]);

    async function loadResults(next: string, controller: AbortController) {
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(next)}`, {
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`Search request returned ${response.status}`);
            }

            const parsed = AnimeSearchResultSchema.array().safeParse(await response.json());
            if (!parsed.success) {
                throw new TypeError('Search request returned an invalid response');
            }

            searchState = { query: next, results: parsed.data, failed: false };
        } catch (cause) {
            if (cause instanceof DOMException && cause.name === 'AbortError') {
                return;
            }

            console.warn('Anime search could not be loaded', cause);
            searchState = { query: next, results: [], failed: true };
        }
    }

    onMount(() => {
        recent.load();
        searchInput?.focus();
    });

    afterNavigate(({ type }) => {
        if (type === 'popstate') {
            query = data.query;
            searchState = { query: data.query, results: data.results, failed: false };
        }
    });

    $effect(() => {
        const next = query.trim();
        if (next === searchState.query) {
            return;
        }

        replaceState(next ? `/search?q=${encodeURIComponent(next)}` : '/search', {});

        if (next.length < 2) {
            searchState = { query: next, results: [], failed: false };
            return;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => void loadResults(next, controller), 250);

        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    });
</script>

<svelte:head>
    <title>Arc — Search anime</title>
    <meta name="description" content="Search Arc’s anime catalog by title." />
</svelte:head>

<main class="min-h-dvh bg-canvas text-foreground">
    <section class="bg-search px-5 py-7 sm:px-10 sm:py-9 lg:px-16">
        <form action="/search" class="mx-auto max-w-6xl" role="search">
            <label for="anime-search" class="sr-only">Search anime</label>
            <input
                id="anime-search"
                name="q"
                type="search"
                placeholder="Search…"
                autocomplete="off"
                bind:this={searchInput}
                bind:value={query}
                class="h-14 w-full border-b-2 border-accent bg-transparent px-0 text-2xl text-foreground outline-none placeholder:text-subtle sm:text-3xl"
            />
        </form>
    </section>

    <div class="mx-auto w-full max-w-6xl px-5 py-7 sm:px-10 sm:py-9 lg:px-0 lg:py-10">
        {#if loading}
            <section aria-label="Searching" aria-live="polite">
                <span class="sr-only">Searching for anime</span>
                <div class="animate-pulse motion-reduce:animate-none" aria-hidden="true">
                    <h1 class="mb-4 text-xl font-bold">Top Results</h1>
                    <div class="grid gap-x-7 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                        {#each Array.from({ length: 3 }) as _, index (index)}
                            <div>
                                <div class="aspect-video bg-surface"></div>
                                <div class="mt-3 h-4 w-3/4 bg-surface"></div>
                                <div class="mt-2 h-4 w-2/5 bg-surface"></div>
                            </div>
                        {/each}
                    </div>

                    {#each ['Series', 'Movies'] as title}
                        <section class="mt-10">
                            <h2 class="mb-3 text-xl font-bold">{title}</h2>
                            <div class="grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                                {#each Array.from({ length: 6 }) as _, index (index)}
                                    <div class="flex min-h-28 gap-3 p-2">
                                        <div class="aspect-2/3 h-24 shrink-0 bg-surface"></div>
                                        <div class="min-w-0 flex-1 py-1">
                                            <div class="h-4 w-4/5 bg-surface"></div>
                                            <div class="mt-2 h-3 w-3/5 bg-surface"></div>
                                            <div class="mt-8 h-4 w-2/5 bg-surface"></div>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </section>
                    {/each}
                </div>
            </section>
        {:else if query.trim().length >= 2}
            {#if searchState.results.length}
                <section aria-labelledby="top-results-title">
                    <h1 id="top-results-title" class="mb-4 text-xl font-bold">Top Results</h1>
                    <div class="grid gap-x-7 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                        {#each topResults as result (result.id)}
                            <AnimeCard anime={result} variant="top" onselect={() => recent.remember(result)} />
                        {/each}
                    </div>
                </section>

                {#key searchState.query}
                    {#each resultSections as section (section.id)}
                        <SearchResultsGroup
                            id={section.id}
                            title={section.title}
                            results={section.results}
                            onselect={(anime) => recent.remember(anime)}
                        />
                    {/each}
                {/key}
            {:else if searchState.failed}
                <p class="text-sm text-muted">Search could not be loaded. Please try again.</p>
            {:else}
                <EmptyState
                    artwork={emptyArtwork}
                    artworkWidth={1254}
                    artworkHeight={1254}
                    id="empty-search-message"
                    body="No anime turned up this time. Try another title, character, or a brave guess."
                />
            {/if}
        {:else if !query.trim() && recent.results.length}
            <section aria-labelledby="recent-results-title">
                <div class="mb-3 flex items-center justify-between gap-6">
                    <h1 id="recent-results-title" class="text-base font-semibold">Recent searches</h1>
                    <button
                        type="button"
                        class="min-h-9 shrink-0 text-xs font-bold uppercase text-muted hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        onclick={() => recent.clear()}
                    >
                        Clear recent
                    </button>
                </div>

                <ul class="flex flex-wrap gap-1.5">
                    {#each recent.results as result (result.id)}
                        <li class="flex min-w-0 max-w-full items-stretch bg-surface/70 text-xs font-semibold">
                            <a
                                href={`/anime/${result.id}`}
                                class="min-w-0 truncate px-2.5 py-2 hover:bg-surface focus-visible:outline-1 focus-visible:outline-accent"
                            >
                                {result.title}
                            </a>
                            <Tooltip text="Remove" class="normal-case">
                                <button
                                    type="button"
                                    class="grid size-9 shrink-0 place-items-center border-l border-black/30 text-muted hover:bg-surface hover:text-foreground focus-visible:outline-1 focus-visible:outline-accent"
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
