<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import { onDestroy, untrack } from 'svelte';
  import {
    CaretDownIcon,
    ChartBarIcon,
    MagnifyingGlassIcon,
    MonitorPlayIcon,
    PulseIcon,
    ShieldCheckIcon,
    SortAscendingIcon,
    SortDescendingIcon,
    TagIcon,
  } from 'phosphor-svelte';

  import {
    browseEnumLabel,
    browseFormatLabel,
    browseHref,
    browseSearchParams,
    browseSorts,
    type BrowseFilters,
  } from '$lib/anime/browse';
  import { isAnimeCardPage, type AnimeCard as AnimeCardModel } from '$lib/anime/types';
  import AnimeCard from '$lib/components/AnimeCard.svelte';
  import Dropdown from '$lib/components/Dropdown.svelte';
  import Tooltip from '$lib/components/Tooltip.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let query = $state(untrack(() => data.filters.query));
  let loadedSelection = $state(untrack(() => browseSearchParams(data.filters).toString()));
  let anime = $state<AnimeCardModel[]>(untrack(() => data.anime));
  let nextPage = $state<number | null>(untrack(() => (data.hasNextPage ? data.page + 1 : null)));
  let loading = $state(false);
  let sentinel = $state<HTMLDivElement>();
  let activeRequest: AbortController | undefined;
  let categoryQuery = $state('');
  let categoryNeedle = $derived(categoryQuery.trim().toLocaleLowerCase('en'));
  let visibleGenres = $derived(
    data.taxonomy.genres.filter((value) => value.toLocaleLowerCase('en').includes(categoryNeedle))
  );
  let visibleTags = $derived(
    data.taxonomy.tags.filter((value) => value.toLocaleLowerCase('en').includes(categoryNeedle))
  );

  function filterHref(patch: Partial<BrowseFilters>) {
    return browseHref({
      ...data.filters,
      query: query.trim(),
      ...patch,
    });
  }

  function filterItems(
    key: 'genre' | 'status' | 'format',
    values: readonly string[],
    current: string | null,
    emptyLabel: string,
    label: (value: string) => string = (value) => value
  ) {
    return [
      {
        label: emptyLabel,
        href: filterHref({ [key]: null }),
        current: current === null,
      },
      ...values.map((value) => ({
        label: label(value),
        href: filterHref({ [key]: value }),
        current: current === value,
      })),
    ];
  }

  function selectedLabel(
    value: string | null,
    fallback: string,
    label: (value: string) => string = (entry) => entry
  ) {
    return value ? label(value) : fallback;
  }

  function selectFilter(patch: Partial<BrowseFilters>) {
    void goto(filterHref(patch), {
      keepFocus: true,
      noScroll: true,
    });
  }

  function responsePage(value: unknown, expectedPage: number) {
    return isAnimeCardPage(value) && value.page === expectedPage ? value : null;
  }

  async function loadMore() {
    const page = nextPage;
    if (page === null || loading) {
      return;
    }

    const requestSelection = loadedSelection;
    const controller = new AbortController();
    activeRequest?.abort();
    activeRequest = controller;
    loading = true;
    let hasNextPage: boolean | undefined;

    try {
      const searchParams = browseSearchParams(data.filters);
      searchParams.set('page', String(page));
      const response = await fetch(`/api/browse?${searchParams}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Browse page request returned ${response.status}`);
      }

      const result = responsePage(await response.json(), page);
      if (!result) {
        throw new TypeError('Browse page request returned an invalid response');
      }
      if (loadedSelection !== requestSelection) {
        return;
      }

      const existing = new Set(anime.map(({ id }) => id));
      anime = [...anime, ...result.anime.filter(({ id }) => !existing.has(id))];
      hasNextPage = result.hasNextPage;
    } catch (cause) {
      if (!(cause instanceof DOMException) || cause.name !== 'AbortError') {
        console.warn(`Browse page ${page} could not be loaded`, cause);
      }
    } finally {
      if (activeRequest === controller) {
        activeRequest = undefined;
        loading = false;
      }
    }

    if (hasNextPage !== undefined && loadedSelection === requestSelection) {
      nextPage = hasNextPage ? page + 1 : null;
    }
  }

  afterNavigate(({ type }) => {
    categoryQuery = '';
    if (type === 'popstate') {
      query = data.filters.query;
    }
  });

  $effect(() => {
    const next = query.trim();
    if (next === data.filters.query) {
      return;
    }

    const timeout = setTimeout(() => {
      void goto(filterHref({ query: next }), {
        replaceState: true,
        keepFocus: true,
        noScroll: true,
      });
    }, 350);

    return () => clearTimeout(timeout);
  });

  $effect(() => {
    const selection = browseSearchParams(data.filters).toString();
    if (selection === loadedSelection) {
      return;
    }

    activeRequest?.abort();
    loadedSelection = selection;
    anime = data.anime;
    nextPage = data.hasNextPage ? data.page + 1 : null;
    loading = false;
  });

  $effect(() => {
    const target = sentinel;
    if (!target || nextPage === null) {
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
  <title>Browse Anime | Arc</title>
  <meta
    name="description"
    content="Browse anime by genre, tag, status, type, popularity, and score."
  />
</svelte:head>

<main class="min-h-dvh bg-canvas px-5 py-10 text-foreground sm:px-10 sm:py-12 lg:px-16 lg:py-16">
  <section class="mx-auto w-full max-w-[96rem]" aria-labelledby="browse-title">
    <h1 id="browse-title" class="mb-6 text-2xl font-semibold">Browse Anime</h1>

    <div class="mb-10 flex flex-wrap items-stretch border-y border-border">
      <label
        class="flex h-12 min-w-64 flex-1 items-center gap-3 px-3 text-muted focus-within:text-foreground"
      >
        <MagnifyingGlassIcon size="1.2rem" weight="regular" class="shrink-0" aria-hidden="true" />
        <span class="sr-only">Search anime</span>
        <input
          name="q"
          type="search"
          placeholder="Search anime…"
          autocomplete="off"
          bind:value={query}
          class="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-subtle"
        />
      </label>

      <Tooltip text={data.filters.safe ? 'Safe for work on' : 'Safe for work off'}>
        <button
          type="button"
          class:text-accent={data.filters.safe}
          class:text-muted={!data.filters.safe}
          class="grid size-12 place-items-center border-l border-border transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-[-1px] focus-visible:outline-accent"
          aria-label={data.filters.safe
            ? 'Disable safe for work filtering'
            : 'Enable safe for work filtering'}
          aria-pressed={data.filters.safe}
          onclick={() => selectFilter({ safe: !data.filters.safe })}
        >
          <ShieldCheckIcon
            size="1.25rem"
            weight={data.filters.safe ? 'fill' : 'regular'}
            aria-hidden="true"
          />
        </button>
      </Tooltip>

      <Dropdown
        id="browse-genre"
        ariaLabel="Filter by genre or tag"
        menuClass="mt-px max-h-80 min-w-52 overflow-y-auto shadow-xl"
        triggerClass="flex h-12 min-w-40 cursor-pointer items-center gap-2 border-l border-border px-3 text-sm text-muted transition-colors hover:text-foreground peer-checked:text-foreground"
      >
        {#snippet trigger()}
          <TagIcon size="1.1rem" weight="regular" aria-hidden="true" />
          <span class="max-w-32 truncate">
            {data.filters.genre ?? data.filters.tag ?? 'Genres'}
          </span>
          <CaretDownIcon size="0.8rem" weight="bold" class="ml-auto" aria-hidden="true" />
        {/snippet}
        {#snippet content()}
          <div role="menu" aria-label="Genre and tag filters">
            <div class="sticky top-0 z-10 border-b border-border bg-panel p-2">
              <label
                class="flex h-9 items-center gap-2 px-2 text-muted focus-within:text-foreground"
              >
                <MagnifyingGlassIcon size="1rem" weight="regular" aria-hidden="true" />
                <span class="sr-only">Search genres and tags</span>
                <input
                  type="search"
                  placeholder="Find a genre or tag…"
                  autocomplete="off"
                  bind:value={categoryQuery}
                  class="h-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-subtle"
                />
              </label>
            </div>
            <a
              role="menuitem"
              href={filterHref({ genre: null, tag: null })}
              aria-current={!data.filters.genre && !data.filters.tag ? 'page' : undefined}
              class:text-accent={!data.filters.genre && !data.filters.tag}
              class:text-muted={Boolean(data.filters.genre || data.filters.tag)}
              class="block whitespace-nowrap px-5 py-3 text-sm leading-tight hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
            >
              All genres and tags
            </a>
            {#if visibleGenres.length}
              <p
                class="border-t border-border px-5 pt-3 pb-1 text-xs font-medium tracking-wide text-subtle uppercase"
              >
                Genres
              </p>
              {#each visibleGenres as genre}
                <a
                  role="menuitem"
                  href={filterHref({ genre, tag: null })}
                  aria-current={data.filters.genre === genre ? 'page' : undefined}
                  class:text-accent={data.filters.genre === genre}
                  class:text-muted={data.filters.genre !== genre}
                  class="block whitespace-nowrap px-5 py-2.5 text-sm leading-tight hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                >
                  {genre}
                </a>
              {/each}
            {/if}
            {#if visibleTags.length}
              <p
                class="border-t border-border px-5 pt-3 pb-1 text-xs font-medium tracking-wide text-subtle uppercase"
              >
                Tags
              </p>
              {#each visibleTags as tag}
                <a
                  role="menuitem"
                  href={filterHref({ genre: null, tag })}
                  aria-current={data.filters.tag === tag ? 'page' : undefined}
                  class:text-accent={data.filters.tag === tag}
                  class:text-muted={data.filters.tag !== tag}
                  class="block whitespace-nowrap px-5 py-2.5 text-sm leading-tight hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                >
                  {tag}
                </a>
              {/each}
            {/if}
            {#if !visibleGenres.length && !visibleTags.length}
              <p class="px-5 py-5 text-sm text-muted">No matching genres or tags.</p>
            {/if}
          </div>
        {/snippet}
      </Dropdown>

      <Dropdown
        id="browse-status"
        items={filterItems(
          'status',
          data.taxonomy.statuses,
          data.filters.status,
          'All statuses',
          browseEnumLabel
        )}
        ariaLabel="Filter by release status"
        menuClass="mt-px max-h-80 min-w-52 overflow-y-auto shadow-xl"
        triggerClass="flex h-12 min-w-40 cursor-pointer items-center gap-2 border-l border-border px-3 text-sm text-muted transition-colors hover:text-foreground peer-checked:text-foreground"
      >
        {#snippet trigger()}
          <PulseIcon size="1.1rem" weight="regular" aria-hidden="true" />
          <span class="max-w-32 truncate">
            {selectedLabel(data.filters.status, 'Status', browseEnumLabel)}
          </span>
          <CaretDownIcon size="0.8rem" weight="bold" class="ml-auto" aria-hidden="true" />
        {/snippet}
      </Dropdown>

      <Dropdown
        id="browse-format"
        items={filterItems(
          'format',
          data.taxonomy.formats,
          data.filters.format,
          'All types',
          browseFormatLabel
        )}
        ariaLabel="Filter by anime type"
        menuClass="mt-px max-h-80 min-w-48 overflow-y-auto shadow-xl"
        triggerClass="flex h-12 min-w-36 cursor-pointer items-center gap-2 border-l border-border px-3 text-sm text-muted transition-colors hover:text-foreground peer-checked:text-foreground"
      >
        {#snippet trigger()}
          <MonitorPlayIcon size="1.1rem" weight="regular" aria-hidden="true" />
          <span class="max-w-28 truncate">
            {selectedLabel(data.filters.format, 'Type', browseFormatLabel)}
          </span>
          <CaretDownIcon size="0.8rem" weight="bold" class="ml-auto" aria-hidden="true" />
        {/snippet}
      </Dropdown>

      <Dropdown
        id="browse-sort"
        items={browseSorts.map((option) => ({
          label: option.label,
          href: filterHref({ sort: option.value }),
          current: data.filters.sort === option.value,
        }))}
        ariaLabel="Choose browse ordering"
        menuClass="mt-px min-w-44 shadow-xl"
        triggerClass="flex h-12 min-w-40 cursor-pointer items-center gap-2 border-l border-border px-3 text-sm text-muted transition-colors hover:text-foreground peer-checked:text-foreground"
      >
        {#snippet trigger()}
          <ChartBarIcon size="1.1rem" weight="regular" aria-hidden="true" />
          <span>
            {browseSorts.find(({ value }) => value === data.filters.sort)?.label}
          </span>
          <CaretDownIcon size="0.8rem" weight="bold" class="ml-auto" aria-hidden="true" />
        {/snippet}
      </Dropdown>

      <Tooltip text={data.filters.order === 'desc' ? 'Descending' : 'Ascending'}>
        <button
          type="button"
          class="grid size-12 place-items-center border-l border-border text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-[-1px] focus-visible:outline-accent"
          aria-label={data.filters.order === 'desc'
            ? 'Sort in ascending order'
            : 'Sort in descending order'}
          onclick={() =>
            selectFilter({
              order: data.filters.order === 'desc' ? 'asc' : 'desc',
            })}
        >
          {#if data.filters.order === 'desc'}
            <SortDescendingIcon size="1.25rem" weight="regular" aria-hidden="true" />
          {:else}
            <SortAscendingIcon size="1.25rem" weight="regular" aria-hidden="true" />
          {/if}
        </button>
      </Tooltip>
    </div>

    {#if data.stale}
      <p class="mb-5 text-sm text-muted" role="status">
        The catalog could not be refreshed. Showing saved results.
      </p>
    {/if}

    {#if anime.length}
      <div
        class="grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-3 sm:gap-x-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7"
      >
        {#each anime as entry (entry.id)}
          <AnimeCard anime={entry} />
        {/each}
      </div>
    {:else}
      <p class="border border-border px-6 py-16 text-center text-sm text-muted">
        No anime match these filters.
      </p>
    {/if}

    {#if nextPage !== null}
      <div bind:this={sentinel} class="h-px w-full" aria-hidden="true"></div>
    {/if}
  </section>
</main>
