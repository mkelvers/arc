<script lang="ts">
  import {
    CaretDownIcon,
    CircleIcon,
    DownloadSimpleIcon,
    ListBulletsIcon,
    RadioButtonIcon,
  } from 'phosphor-svelte';

  import emptyArtwork from '$lib/assets/watchlist-empty.png';
  import filteredEmptyArtwork from '$lib/assets/watchlist-filter-empty.png';
  import Dropdown from '$lib/components/Dropdown.svelte';
  import StatusBanner from '$lib/components/StatusBanner.svelte';
  import Tooltip from '$lib/components/Tooltip.svelte';
  import WatchlistCard from '$lib/components/WatchlistCard.svelte';
  import WatchlistImportDialog from '$lib/components/WatchlistImportDialog.svelte';
  import type { WatchlistOrder, WatchlistSort, WatchlistState } from '$lib/watchlist';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let statusMessage = $state('');
  let statusTone = $state<'error' | 'success'>('success');

  const filters = [
    { value: 'all', label: 'All' },
    { value: 'watching', label: 'Watching' },
    { value: 'plan_to_watch', label: 'Plan to Watch' },
    { value: 'completed', label: 'Completed' },
    { value: 'dropped', label: 'Dropped' },
  ] as const satisfies ReadonlyArray<{
    value: WatchlistState | 'all';
    label: string;
  }>;
  const sorts = [
    { value: 'recent_activity', label: 'Recent Activity' },
    { value: 'updated', label: 'Updated' },
    { value: 'watched', label: 'Watched' },
    { value: 'added', label: 'Added' },
    { value: 'alphabetical', label: 'Alphabetical' },
  ] as const satisfies ReadonlyArray<{ value: WatchlistSort; label: string }>;
  const orders = [
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
  ] as const satisfies ReadonlyArray<{ value: WatchlistOrder; label: string }>;
  const selectedStateLabel = $derived(
    filters.find(({ value }) => value === data.selection.state)?.label ?? 'All'
  );
  const selectedSortLabel = $derived(
    sorts.find(({ value }) => value === data.selection.sort)?.label ?? 'Recent Activity'
  );
  const filteredEmptyCopy = $derived.by(() => {
    switch (data.selection.state) {
      case 'watching':
        return {
          title: 'Ready when you are.',
          body: 'Start watching something and it’ll appear here.',
        };
      case 'plan_to_watch':
        return {
          title: 'No plans queued up.',
          body: 'Bookmark something for later and it’ll show up here.',
        };
      case 'completed':
        return {
          title: 'Your finished shelf is waiting.',
          body: 'Anime you finish will take its place here.',
        };
      case 'dropped':
        return {
          title: 'Nothing left behind.',
          body: 'Anything you choose to drop will appear here.',
        };
      default:
        return {
          title: 'No matching anime.',
          body: 'Try another watchlist status to find what you’re looking for.',
        };
    }
  });

  function selectionHref(
    patch: Partial<{
      state: WatchlistState | 'all';
      sort: WatchlistSort;
      order: WatchlistOrder;
    }>
  ) {
    const selection = { ...data.selection, ...patch };
    const query = new URLSearchParams();

    if (selection.state !== 'all') {
      query.set('state', selection.state);
    }
    if (selection.sort !== 'recent_activity') {
      query.set('sort', selection.sort);
    }
    if (selection.order !== 'newest') {
      query.set('order', selection.order);
    }

    const search = query.toString();
    return search ? `/watchlist?${search}` : '/watchlist';
  }

  function showStatus(message: string, tone: 'error' | 'success') {
    statusMessage = message;
    statusTone = tone;
  }
</script>

<StatusBanner message={statusMessage} tone={statusTone} ondismiss={() => (statusMessage = '')} />

<main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
  <div class="mx-auto w-full max-w-384 px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
    <h1 class="text-2xl font-semibold">Watchlist</h1>

    <div class="mt-8 flex min-w-0 items-end border-b border-border sm:mt-10">
      <nav class="min-w-0 flex-1 overflow-x-auto" aria-label="Watchlist statuses">
        <ul class="-mb-px flex min-w-max gap-5 sm:gap-7">
          {#each filters as filter}
            <li>
              <a
                href={selectionHref({ state: filter.value })}
                class:border-accent={data.selection.state === filter.value}
                class:border-transparent={data.selection.state !== filter.value}
                class:text-foreground={data.selection.state === filter.value}
                class="inline-flex h-12 items-center border-b-2 text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-current={data.selection.state === filter.value ? 'page' : undefined}
              >
                {filter.label}
              </a>
            </li>
          {/each}
        </ul>
      </nav>

      <div class="mb-2 ml-3 flex h-10 shrink-0 items-center" aria-label="Watchlist data">
        <WatchlistImportDialog onresult={showStatus} />
        <Tooltip text="Export watchlist">
          <a
            href="/watchlist/export"
            class="grid size-10 place-items-center text-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent"
            aria-label="Export watchlist"
            download
          >
            <DownloadSimpleIcon size="1.2rem" weight="regular" aria-hidden="true" />
          </a>
        </Tooltip>
      </div>

      {#if data.totalEntries}
        <Dropdown
          id="watchlist-sort"
          ariaLabel={`Sort watchlist. ${selectedSortLabel}, ${data.selection.order} selected`}
          menuClass="mt-2 w-56 shadow-xl"
          triggerClass="mb-2 ml-1 flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground peer-checked:bg-surface peer-checked:text-foreground"
        >
          {#snippet trigger()}
            <ListBulletsIcon size="1.2rem" weight="bold" aria-hidden="true" />
            <span class="hidden sm:inline">{selectedSortLabel}</span>
            <CaretDownIcon size="0.8rem" weight="bold" aria-hidden="true" />
          {/snippet}

          {#snippet content()}
            <div role="menu" aria-label="Watchlist sorting" class="py-2">
              {#each sorts as sort}
                <a
                  role="menuitemradio"
                  aria-checked={data.selection.sort === sort.value}
                  href={selectionHref({ sort: sort.value })}
                  class:text-foreground={data.selection.sort === sort.value}
                  class="flex min-h-11 items-center gap-2.5 px-5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                >
                  {#if data.selection.sort === sort.value}
                    <RadioButtonIcon
                      size="1.25rem"
                      weight="fill"
                      class="text-accent"
                      aria-hidden="true"
                    />
                  {:else}
                    <CircleIcon size="1.25rem" weight="regular" aria-hidden="true" />
                  {/if}
                  {sort.label}
                </a>
              {/each}

              <p class="px-5 pt-5 pb-2 text-xs font-bold text-foreground uppercase">Sort Order</p>
              {#each orders as order}
                <a
                  role="menuitemradio"
                  aria-checked={data.selection.order === order.value}
                  href={selectionHref({ order: order.value })}
                  class:text-foreground={data.selection.order === order.value}
                  class="flex min-h-11 items-center gap-2.5 px-5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                >
                  {#if data.selection.order === order.value}
                    <RadioButtonIcon
                      size="1.25rem"
                      weight="fill"
                      class="text-accent"
                      aria-hidden="true"
                    />
                  {:else}
                    <CircleIcon size="1.25rem" weight="regular" aria-hidden="true" />
                  {/if}
                  {order.label}
                </a>
              {/each}
            </div>
          {/snippet}
        </Dropdown>
      {/if}
    </div>

    {#if data.totalEntries === 0}
      <section
        class="mt-10 grid min-h-120 place-items-center border border-dashed border-border px-6 py-12 text-center sm:mt-12"
        aria-labelledby="empty-watchlist-title"
      >
        <div class="flex max-w-md flex-col items-center">
          <img src={emptyArtwork} alt="" width="566" height="720" class="h-auto w-48 sm:w-56" />
          <h2 id="empty-watchlist-title" class="mt-1 text-lg font-semibold">
            Your watchlist needs some love.
          </h2>
          <p class="mt-2 text-sm leading-6 text-muted">Let’s fill it with some awesome anime.</p>
          <a
            href="/"
            class="mt-6 inline-flex min-h-11 items-center bg-accent px-5 text-xs font-bold text-on-accent uppercase transition-opacity hover:opacity-85 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Go to Home Feed
          </a>
        </div>
      </section>
    {:else if data.entries.length === 0}
      <section
        class="mt-10 grid min-h-96 place-items-center border border-dashed border-border px-6 py-10 text-center sm:mt-12"
        aria-labelledby="empty-filter-title"
      >
        <div class="flex max-w-sm flex-col items-center">
          <img
            src={filteredEmptyArtwork}
            alt=""
            width="622"
            height="640"
            class="h-auto w-40 sm:w-44"
          />
          <h2 id="empty-filter-title" class="mt-2 text-lg font-semibold">
            {filteredEmptyCopy.title}
          </h2>
          <p class="mt-2 text-sm leading-6 text-muted">{filteredEmptyCopy.body}</p>
          <a
            href={selectionHref({ state: 'all' })}
            class="mt-6 inline-flex min-h-11 items-center bg-accent px-5 text-xs font-bold text-on-accent uppercase transition-opacity hover:opacity-85 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            View All Watchlist
          </a>
        </div>
      </section>
    {:else}
      <section class="mt-8" aria-label={`${selectedStateLabel} anime`}>
        <div
          class="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 2xl:gap-x-5"
        >
          {#each data.entries as entry (entry.id)}
            <WatchlistCard anime={entry} />
          {/each}
        </div>
      </section>
    {/if}
  </div>
</main>
