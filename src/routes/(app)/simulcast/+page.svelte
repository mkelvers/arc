<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { CaretDownIcon } from 'phosphor-svelte';

  import { isAnimeCardPage, type AnimeCard as AnimeCardModel } from '$lib/anime/types';
  import AnimeCard from '$lib/components/AnimeCard.svelte';
  import Dropdown from '$lib/components/Dropdown.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let loadedSelection = $state(untrack(() => `${data.season}:${data.year}`));
  let anime = $state<AnimeCardModel[]>(untrack(() => data.page.anime));
  let nextPage = $state<number | null>(
    untrack(() => (data.page.hasNextPage ? data.page.page + 1 : null))
  );
  let loading = $state(false);
  let failure = $state('');
  let sentinel = $state<HTMLDivElement>();
  let activeRequest: AbortController | undefined;

  function responsePage(value: unknown, expectedPage: number) {
    return isAnimeCardPage(value) && value.page === expectedPage ? value : null;
  }

  async function loadMore() {
    const page = nextPage;
    if (page === null || loading || failure) {
      return;
    }

    const requestSelection = loadedSelection;
    const controller = new AbortController();
    activeRequest?.abort();
    activeRequest = controller;
    loading = true;

    try {
      const query = new URLSearchParams({
        season: data.season.toLowerCase(),
        year: String(data.year),
        page: String(page),
      });
      const response = await fetch(`/api/simulcast?${query}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Simulcast page request returned ${response.status}`);
      }

      const result = responsePage(await response.json(), page);
      if (!result) {
        throw new TypeError('Simulcast page request returned an invalid response');
      }
      if (loadedSelection !== requestSelection) {
        return;
      }

      const existing = new Set(anime.map(({ id }) => id));
      anime = [...anime, ...result.anime.filter(({ id }) => !existing.has(id))];
      nextPage = result.hasNextPage ? page + 1 : null;
    } catch (cause) {
      if (!(cause instanceof DOMException) || cause.name !== 'AbortError') {
        failure = 'More simulcast releases could not be loaded.';
      }
    } finally {
      if (activeRequest === controller) {
        activeRequest = undefined;
        loading = false;
      }
    }
  }

  function retry() {
    failure = '';
    void loadMore();
  }

  $effect(() => {
    const selection = `${data.season}:${data.year}`;
    if (selection === loadedSelection) {
      return;
    }

    activeRequest?.abort();
    loadedSelection = selection;
    anime = data.page.anime;
    nextPage = data.page.hasNextPage ? data.page.page + 1 : null;
    loading = false;
    failure = '';
  });

  $effect(() => {
    const target = sentinel;
    if (!target || nextPage === null || failure) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(target);

    return () => observer.disconnect();
  });

  onDestroy(() => activeRequest?.abort());
</script>

<svelte:head>
  <title>Simulcast — {data.label} | Arc</title>
  <meta name="description" content={`Browse anime from the ${data.label} simulcast season.`} />
</svelte:head>

<main class="min-h-dvh bg-canvas px-5 py-10 text-foreground sm:px-10 sm:py-12 lg:px-16 lg:py-16">
  <section class="mx-auto w-full max-w-384" aria-labelledby="simulcast-title">
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 id="simulcast-title" class="text-2xl font-semibold">Simulcast Season</h1>
      <Dropdown
        id="simulcast-season"
        items={data.options}
        ariaLabel={`Choose simulcast season. ${data.label} selected`}
        menuClass="mt-2 max-h-80 min-w-48 overflow-y-auto shadow-xl"
        triggerClass="flex h-11 min-w-44 cursor-pointer items-center justify-between gap-3 bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-header-hover peer-checked:bg-header-hover"
      >
        {#snippet trigger()}
          <span>{data.label}</span>
          <CaretDownIcon size="1rem" weight="bold" class="text-muted" aria-hidden="true" />
        {/snippet}
      </Dropdown>
    </div>

    {#if anime.length}
      <div
        class="grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-3 sm:gap-x-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      >
        {#each anime as entry (entry.id)}
          <AnimeCard anime={entry} />
        {/each}
      </div>
    {:else}
      <p class="border border-border px-6 py-16 text-center text-sm text-muted">
        No anime were found for {data.label}.
      </p>
    {/if}

    {#if nextPage !== null}
      <div
        bind:this={sentinel}
        class="flex min-h-24 items-center justify-center"
        aria-live="polite"
      >
        {#if loading}
          <p class="text-sm text-muted" role="status">Loading more releases…</p>
        {:else if failure}
          <div class="flex flex-col items-center gap-3 text-center">
            <p class="text-sm text-muted">{failure}</p>
            <button
              type="button"
              class="min-h-11 px-4 text-sm font-semibold text-accent hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
              onclick={retry}
            >
              Try again
            </button>
          </div>
        {:else}
          <span class="sr-only"> More releases load automatically while scrolling. </span>
        {/if}
      </div>
    {/if}
  </section>
</main>
