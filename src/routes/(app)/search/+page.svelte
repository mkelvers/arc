<script lang="ts">
  import { afterNavigate, replaceState } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import { XIcon } from 'phosphor-svelte';

  import {
    distinctSearchArtwork,
    isAnimeSearchResults,
    type AnimeSearchResult,
  } from '$lib/anime/search';
  import SearchResultSection from '$lib/components/SearchResultSection.svelte';
  import SearchTopResultCard from '$lib/components/SearchTopResultCard.svelte';
  import Tooltip from '$lib/components/Tooltip.svelte';
  import { RecentSearches } from './recent.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const recent = new RecentSearches();
  let query = $state(untrack(() => data.query));
  let results = $state<AnimeSearchResult[]>(untrack(() => data.results));
  let resultQuery = $state(untrack(() => data.query));
  let loading = $state(false);
  let failed = $state(false);
  let activeRequest: AbortController | undefined;

  const searchableResults = $derived(results.filter(({ format }) => format !== 'MUSIC'));
  const topResults = $derived(distinctSearchArtwork(searchableResults, 4));
  const series = $derived(
    searchableResults.filter(({ format }) => format !== 'MOVIE' && format !== 'MUSIC')
  );
  const movies = $derived(searchableResults.filter(({ format }) => format === 'MOVIE'));

  onMount(() => recent.load());

  afterNavigate(({ type }) => {
    if (type === 'popstate') {
      query = data.query;
      results = data.results;
      resultQuery = data.query;
      loading = false;
      failed = false;
    }
  });

  $effect(() => {
    const next = query.trim();
    if (next === resultQuery) {
      return;
    }

    activeRequest?.abort();
    failed = false;
    replaceState(next ? `/search?q=${encodeURIComponent(next)}` : '/search', {});

    if (next.length < 2) {
      results = [];
      resultQuery = next;
      loading = false;
      return;
    }

    loading = true;
    const timeout = setTimeout(() => {
      const controller = new AbortController();
      activeRequest = controller;

      void fetch(`/api/search?q=${encodeURIComponent(next)}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Search request returned ${response.status}`);
          }

          const responseResults: unknown = await response.json();
          if (!isAnimeSearchResults(responseResults)) {
            throw new TypeError('Search request returned an invalid response');
          }

          results = responseResults;
          resultQuery = next;
        })
        .catch((cause) => {
          if (!(cause instanceof DOMException) || cause.name !== 'AbortError') {
            console.warn('Anime search could not be loaded', cause);
            results = [];
            resultQuery = next;
            failed = true;
          }
        })
        .finally(() => {
          if (activeRequest === controller) {
            activeRequest = undefined;
            loading = false;
          }
        });
    }, 175);

    return () => clearTimeout(timeout);
  });

  function remember(anime: AnimeSearchResult) {
    recent.remember(anime);
  }
</script>

<main class="min-h-dvh bg-canvas text-foreground">
  <section class="bg-search px-5 py-7 sm:px-10 sm:py-9 lg:px-16">
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

  <div class="mx-auto w-full max-w-6xl px-5 py-7 sm:px-10 sm:py-9 lg:px-0 lg:py-10">
    {#if loading}
      <section aria-label="Searching" aria-live="polite">
        <span class="sr-only">Searching for anime</span>
        <div class="mb-4 h-5 w-28 animate-pulse bg-surface"></div>
        <div class="grid gap-x-7 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {#each Array(6) as _}
            <div class="animate-pulse">
              <div class="aspect-video bg-surface"></div>
              <div class="mt-3 h-3.5 w-4/5 bg-surface"></div>
              <div class="mt-2 h-3 w-2/5 bg-surface"></div>
            </div>
          {/each}
        </div>
      </section>
    {:else if resultQuery}
      {#if results.length}
        <section aria-labelledby="top-results-title">
          <h1 id="top-results-title" class="mb-4 text-xl font-bold">Top Results</h1>
          <div class="grid gap-x-7 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {#each topResults as result (result.id)}
              <SearchTopResultCard anime={result} onselect={remember} />
            {/each}
          </div>
        </section>

        {#key resultQuery}
          <SearchResultSection
            id="series-results"
            title="Series"
            results={series}
            onselect={remember}
          />
          <SearchResultSection
            id="movie-results"
            title="Movies"
            results={movies}
            onselect={remember}
          />
        {/key}
      {:else if failed}
        <p class="text-sm text-muted">Search could not be loaded. Please try again.</p>
      {/if}
    {:else if recent.results.length}
      <section aria-labelledby="recent-results-title">
        <div class="mb-3 flex items-center justify-between gap-6">
          <h1 id="recent-results-title" class="text-base font-semibold">Recent searches</h1>
          <button
            type="button"
            class="min-h-9 shrink-0 text-xs font-bold uppercase text-muted hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onclick={() => recent.clear()}
          >
            Clear Recent
          </button>
        </div>

        <ul class="flex flex-wrap gap-1.5">
          {#each recent.results as result (result.id)}
            <li class="flex min-w-0 max-w-full items-stretch bg-surface/70 text-xs font-semibold">
              <a
                href={result.href}
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
