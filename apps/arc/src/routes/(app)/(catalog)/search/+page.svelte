<script lang="ts">
    import { afterNavigate, replaceState } from '$app/navigation';
    import { onMount, untrack } from 'svelte';
    import { XIcon } from 'phosphor-svelte';
    import { distinctSearchArtwork, AnimeSearchResultSchema, type AnimeSearchResult } from '@arc/core/search';
    import emptyArtwork from '$lib/assets/search-empty.png';
    import errorArtwork from '$lib/assets/error-state.png';
    import AnimeCardSkeleton from '$lib/components/AnimeCardSkeleton.svelte';
    import EmptyState from '$lib/components/ui/EmptyState.svelte';
    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import Tooltip from '$lib/components/ui/Tooltip.svelte';
    import { Input } from '$lib/components/ui/input';
    import SearchResultsGroup from './_components/SearchResultsGroup.svelte';
    import { RecentSearches } from './recent.svelte';
    import type { PageProps } from './$types';
    import { m } from '$lib/i18n.svelte';

    type SearchState = { query: string; results: AnimeSearchResult[]; failed: boolean };

    let { data }: PageProps = $props();
    const recent = new RecentSearches();
    let searchInput = $state<HTMLInputElement | null>(null);
    let query = $state(untrack(() => data.query));
    let pending = $state(untrack(() => data.query.length >= 2));
    let searchState: SearchState = $state({
        query: untrack(() => (data.query.length >= 2 ? '' : data.query)),
        results: [],
        failed: false,
    });
    const loading = $derived(pending || query.trim() !== searchState.query);

    const topResults = $derived(
        distinctSearchArtwork(
            searchState.results.filter(({ format }) => format !== 'MUSIC'),
            4
        )
    );
    const resultSections = $derived([
        {
            id: 'series-results',
            title: m.search_series(),
            results: searchState.results.filter(({ format }) => format !== 'MOVIE' && format !== 'MUSIC'),
        },
        {
            id: 'movie-results',
            title: m.search_movies(),
            results: searchState.results.filter(({ format }) => format === 'MOVIE'),
        },
    ]);

    async function loadResults(next: string, controller: AbortController) {
        try {
            const response = await fetch(`/v1/search?q=${encodeURIComponent(next)}`, {
                headers: {
                    Accept: 'application/json',
                },
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
        if (window.matchMedia('(pointer: fine)').matches) {
            searchInput?.focus();
        }
    });

    afterNavigate(({ type }) => {
        if (type === 'popstate') {
            query = data.query;
        }
    });

    $effect(() => {
        const requestedQuery = data.query;
        const request = data.results;
        pending = requestedQuery.length >= 2;

        void request.then((result) => {
            if (query.trim() !== requestedQuery) {
                return;
            }

            searchState = {
                query: requestedQuery,
                results: result.status === 'success' ? result.data : [],
                failed: result.status === 'error',
            };
            pending = false;
        });
    });

    $effect(() => {
        const next = query.trim();
        if (next === searchState.query) {
            return;
        }

        if (pending && next === data.query) {
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
    <title>Arc — {m.search_anime()}</title>
    <meta name="description" content={m.search_anime()} />
</svelte:head>

<main class="min-h-dvh overflow-x-clip bg-canvas text-foreground">
    <h1 class="sr-only">{m.search_anime()}</h1>
    <section class="overflow-x-clip bg-search px-5 py-7 sm:px-10 sm:py-9 lg:px-16">
        <form action="/search" class="mx-auto min-w-0 max-w-6xl" role="search">
            <label for="anime-search" class="sr-only">{m.search_anime()}</label>
            <Input
                id="anime-search"
                name="q"
                type="search"
                placeholder={m.search_placeholder()}
                autocomplete="off"
                bind:ref={searchInput}
                bind:value={query}
                class="h-14 w-full min-w-0 max-w-full appearance-none rounded-none border-0 border-b-2 border-accent bg-transparent px-0 text-2xl text-foreground outline-none ring-0 placeholder:text-subtle focus-visible:border-accent focus-visible:ring-0 sm:text-3xl"
            />
        </form>
    </section>

    <div class="mx-auto w-full max-w-6xl px-5 py-7 sm:px-10 sm:py-9 lg:px-0 lg:py-10">
        {#if loading}
            <section aria-label={m.searching()} aria-live="polite">
                <span class="sr-only">{m.searching_for_anime()}</span>
                <div aria-hidden="true">
                    <div class="space-y-3 sm:hidden">
                        {#each Array.from({ length: 7 }) as _, index (index)}
                            <AnimeCardSkeleton variant="compact" />
                        {/each}
                    </div>
                    <div class="hidden sm:block">
                        <h2 class="mb-4 text-xl font-bold">{m.search_top_results()}</h2>
                        <div class="grid gap-x-7 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                            {#each Array.from({ length: 3 }) as _, index (index)}
                                <AnimeCardSkeleton variant="top" />
                            {/each}
                        </div>

                        {#each [m.search_series(), m.search_movies()] as title}
                            <section class="mt-10">
                                <h2 class="mb-3 text-xl font-bold">{title}</h2>
                                <div class="grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                                    {#each Array.from({ length: 6 }) as _, index (index)}
                                        <AnimeCardSkeleton variant="compact" />
                                    {/each}
                                </div>
                            </section>
                        {/each}
                    </div>
                </div>
            </section>
        {:else if query.trim().length >= 2}
            {#if searchState.results.length}
                <section aria-labelledby="top-results-title">
                    <h2 id="top-results-title" class="mb-4 text-xl font-bold">{m.search_top_results()}</h2>
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
                <EmptyState
                    artwork={errorArtwork}
                    artworkWidth={1254}
                    artworkHeight={1254}
                    id="search-error-message"
                    title={m.search_error_title()}
                    body={m.search_error_body()}
                />
            {:else}
                <EmptyState
                    artwork={emptyArtwork}
                    artworkWidth={1254}
                    artworkHeight={1254}
                    id="empty-search-message"
                    body={m.search_empty()}
                />
            {/if}
        {:else if !query.trim() && recent.results.length}
            <section aria-labelledby="recent-results-title">
                <div class="mb-3 flex items-center justify-between gap-6">
                    <h2 id="recent-results-title" class="text-base font-semibold">{m.search_recent()}</h2>
                    <button
                        type="button"
                        class="min-h-9 shrink-0 text-xs font-bold uppercase text-muted transition-[color,transform] duration-150 hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97]"
                        onclick={() => recent.clear()}
                    >
                        {m.search_clear_recent()}
                    </button>
                </div>

                <ul class="flex flex-wrap gap-1.5">
                    {#each recent.results as result (result.id)}
                        <li
                            class="flex min-w-0 max-w-86 items-stretch bg-search-recent text-xs uppercase text-muted"
                        >
                            <a
                                href={`/anime/${result.id}`}
                                class="min-w-0 truncate px-2.5 py-2 transition-colors hover:bg-white/8 focus-visible:outline-1 focus-visible:outline-accent"
                            >
                                {result.title}
                            </a>
                            <button
                                type="button"
                                class="grid size-9 shrink-0 place-items-center border-l border-black/30 text-muted transition-colors hover:bg-white/8 hover:text-foreground focus-visible:outline-1 focus-visible:outline-accent active:scale-90"
                                aria-label={m.search_remove_recent({ title: result.title })}
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
