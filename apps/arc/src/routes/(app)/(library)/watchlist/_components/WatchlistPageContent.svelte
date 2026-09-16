<script lang="ts">
    import { CaretDownIcon, CaretLeftIcon, CaretRightIcon, FunnelIcon, ListBulletsIcon } from 'phosphor-svelte';

    import emptyArtwork from '$lib/assets/watchlist-empty.webp';
    import filteredEmptyArtwork from '$lib/assets/watchlist-filter-empty.webp';
    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import Button from '$lib/components/ui/button/Button.svelte';
    import Dropdown from '$lib/components/ui/dropdown/Dropdown.svelte';
    import EmptyState from '$lib/components/ui/EmptyState.svelte';
    import MenuRadio from '$lib/components/ui/snippets/MenuRadio.svelte';
    import { m } from '$lib/i18n.svelte';
    import { filterWatchlist, setWatchlistFilter, watchlistFilters } from '$lib/watchlist-filters';
    import { watchlist } from '$lib/watchlist.svelte';
    import type { PageData } from '../$types';
    import WatchlistPendingCard from './WatchlistPendingCard.svelte';

    type PageResult = Awaited<PageData['page']>;
    type Page = Extract<PageResult, { status: 'success' }>['data'];
    type Props = { data: Page };

    let { data }: Props = $props();

    let filterView = $state<'main' | 'type'>('main');
    let filteredEntries = $derived(filterWatchlist(data.entries, $watchlistFilters));
</script>

<main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
    <div class="mx-auto w-full max-w-384 px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
        <h1 class="text-2xl font-semibold">{m.watchlist_title()}</h1>

        <div class="mt-8 flex min-w-0 items-end border-b border-border sm:mt-10">
            <div class="min-w-0 flex-1 sm:hidden">
                <Dropdown id="watchlist-status-mobile" className="w-56 *:p-0">
                    {#snippet trigger()}
                        <span class="truncate">
                            {#if $watchlistFilters.state === 'all'}
                                {m.watchlist_all()}
                            {:else if $watchlistFilters.state === 'watching'}
                                {m.watchlist_watching()}
                            {:else if $watchlistFilters.state === 'plan_to_watch'}
                                {m.watchlist_plan()}
                            {:else if $watchlistFilters.state === 'completed'}
                                {m.watchlist_completed()}
                            {:else}
                                {m.watchlist_dropped()}
                            {/if}
                        </span>
                        <CaretDownIcon class="shrink-0" size="0.8rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                    {#snippet children()}
                        <div role="menu" aria-label={m.watchlist_statuses()}>
                            <button
                                type="button"
                                role="menuitem"
                                aria-current={$watchlistFilters.state === 'all' ? 'page' : undefined}
                                class="block w-full appearance-none border-0 bg-transparent whitespace-nowrap px-5 py-3 text-left text-sm leading-tight text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                onclick={() => setWatchlistFilter('state', 'all')}
                            >
                                {m.watchlist_all()}
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                aria-current={$watchlistFilters.state === 'watching' ? 'page' : undefined}
                                class="block w-full appearance-none border-0 bg-transparent whitespace-nowrap px-5 py-3 text-left text-sm leading-tight text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                onclick={() => setWatchlistFilter('state', 'watching')}
                            >
                                {m.watchlist_watching()}
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                aria-current={$watchlistFilters.state === 'plan_to_watch' ? 'page' : undefined}
                                class="block w-full appearance-none border-0 bg-transparent whitespace-nowrap px-5 py-3 text-left text-sm leading-tight text-muted hover:bg-panel-hover focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                onclick={() => setWatchlistFilter('state', 'plan_to_watch')}
                            >
                                {m.watchlist_plan()}
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                aria-current={$watchlistFilters.state === 'completed' ? 'page' : undefined}
                                class="block w-full appearance-none border-0 bg-transparent whitespace-nowrap px-5 py-3 text-left text-sm leading-tight text-muted hover:bg-panel-hover focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                onclick={() => setWatchlistFilter('state', 'completed')}
                            >
                                {m.watchlist_completed()}
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                aria-current={$watchlistFilters.state === 'dropped' ? 'page' : undefined}
                                class="block w-full appearance-none border-0 bg-transparent whitespace-nowrap px-5 py-3 text-left text-sm leading-tight text-muted hover:bg-panel-hover focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                onclick={() => setWatchlistFilter('state', 'dropped')}
                            >
                                {m.watchlist_dropped()}
                            </button>
                        </div>
                    {/snippet}
                </Dropdown>
            </div>

            <nav
                class="scrollbar-hidden hidden min-w-0 flex-1 overflow-x-auto sm:block"
                aria-label={m.watchlist_statuses()}
            >
                <ul class="-mb-px flex min-w-max gap-5 sm:gap-7">
                    <li>
                        <button
                            type="button"
                            class:border-accent={$watchlistFilters.state === 'all'}
                            class:border-transparent={$watchlistFilters.state !== 'all'}
                            class:text-foreground={$watchlistFilters.state === 'all'}
                            class="inline-flex h-12 appearance-none items-center border-0 border-b-2 bg-transparent text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-current={$watchlistFilters.state === 'all' ? 'page' : undefined}
                            onclick={() => setWatchlistFilter('state', 'all')}
                        >
                            {m.watchlist_all()}
                        </button>
                    </li>
                    <li>
                        <button
                            type="button"
                            class:border-accent={$watchlistFilters.state === 'watching'}
                            class:border-transparent={$watchlistFilters.state !== 'watching'}
                            class:text-foreground={$watchlistFilters.state === 'watching'}
                            class="inline-flex h-12 appearance-none items-center border-0 border-b-2 bg-transparent text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-current={$watchlistFilters.state === 'watching' ? 'page' : undefined}
                            onclick={() => setWatchlistFilter('state', 'watching')}
                        >
                            {m.watchlist_watching()}
                        </button>
                    </li>
                    <li>
                        <button
                            type="button"
                            class:border-accent={$watchlistFilters.state === 'plan_to_watch'}
                            class:border-transparent={$watchlistFilters.state !== 'plan_to_watch'}
                            class:text-foreground={$watchlistFilters.state === 'plan_to_watch'}
                            class="inline-flex h-12 appearance-none items-center border-0 border-b-2 bg-transparent text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-current={$watchlistFilters.state === 'plan_to_watch' ? 'page' : undefined}
                            onclick={() => setWatchlistFilter('state', 'plan_to_watch')}
                        >
                            {m.watchlist_plan()}
                        </button>
                    </li>
                    <li>
                        <button
                            type="button"
                            class:border-accent={$watchlistFilters.state === 'completed'}
                            class:border-transparent={$watchlistFilters.state !== 'completed'}
                            class:text-foreground={$watchlistFilters.state === 'completed'}
                            class="inline-flex h-12 appearance-none items-center border-0 border-b-2 bg-transparent text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-current={$watchlistFilters.state === 'completed' ? 'page' : undefined}
                            onclick={() => setWatchlistFilter('state', 'completed')}
                        >
                            {m.watchlist_completed()}
                        </button>
                    </li>
                    <li>
                        <button
                            type="button"
                            class:border-accent={$watchlistFilters.state === 'dropped'}
                            class:border-transparent={$watchlistFilters.state !== 'dropped'}
                            class:text-foreground={$watchlistFilters.state === 'dropped'}
                            class="inline-flex h-12 appearance-none items-center border-0 border-b-2 bg-transparent text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-current={$watchlistFilters.state === 'dropped' ? 'page' : undefined}
                            onclick={() => setWatchlistFilter('state', 'dropped')}
                        >
                            {m.watchlist_dropped()}
                        </button>
                    </li>
                </ul>
            </nav>

            {#if data.totalEntries}
                <Dropdown id="watchlist-filter" className="mb-2 w-64 *:p-0">
                    {#snippet trigger()}
                        <FunnelIcon size="1.2rem" weight="bold" aria-hidden="true" />
                        <span class="hidden sm:inline">{m.watchlist_filter()}</span>
                        {#if $watchlistFilters.language !== 'all' || $watchlistFilters.media !== 'all' || $watchlistFilters.type !== 'all'}
                            <span class="text-accent">
                                {Number($watchlistFilters.language !== 'all') +
                                    Number($watchlistFilters.media !== 'all') +
                                    Number($watchlistFilters.type !== 'all')}
                            </span>
                        {/if}
                    {/snippet}

                    {#snippet children()}
                        <div role="menu" aria-label={m.watchlist_filtering()}>
                            {#if filterView === 'main'}
                                <Button
                                    type="button"
                                    role="menuitem"
                                    aria-haspopup="menu"
                                    aria-expanded="false"
                                    class="flex min-h-11 w-full items-center justify-between px-5 text-left text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    onclick={(event) => {
                                        event.stopPropagation();
                                        filterView = 'type';
                                    }}
                                >
                                    <span>{m.watchlist_type()}</span>
                                    <span class="flex items-center gap-1 text-foreground">
                                        {#if $watchlistFilters.type === 'all'}
                                            {m.watchlist_all()}
                                        {:else if $watchlistFilters.type === 'airing'}
                                            {m.watchlist_airing()}
                                        {:else if $watchlistFilters.type === 'finished'}
                                            {m.watchlist_finished()}
                                        {:else if $watchlistFilters.type === 'not_yet_released'}
                                            {m.watchlist_not_released()}
                                        {:else if $watchlistFilters.type === 'cancelled'}
                                            {m.watchlist_cancelled()}
                                        {:else}
                                            {m.watchlist_hiatus()}
                                        {/if}
                                        <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
                                    </span>
                                </Button>

                                <div role="group" aria-label={m.watchlist_language()}>
                                    <p class="px-5 pt-3 pb-2 text-xs font-bold text-foreground uppercase">
                                        {m.watchlist_language()}
                                    </p>
                                    <MenuRadio
                                        selected={$watchlistFilters.language === 'all'}
                                        label={m.watchlist_all()}
                                        onclick={() => setWatchlistFilter('language', 'all')}
                                    />
                                    <MenuRadio
                                        selected={$watchlistFilters.language === 'sub'}
                                        label={m.watchlist_subtitled()}
                                        onclick={() => setWatchlistFilter('language', 'sub')}
                                    />
                                    <MenuRadio
                                        selected={$watchlistFilters.language === 'dub'}
                                        label={m.watchlist_dubbed()}
                                        onclick={() => setWatchlistFilter('language', 'dub')}
                                    />
                                </div>

                                <div role="group" aria-label={m.watchlist_media()}>
                                    <p class="px-5 pt-3 pb-2 text-xs font-bold text-foreground uppercase">
                                        {m.watchlist_media()}
                                    </p>
                                    <MenuRadio
                                        selected={$watchlistFilters.media === 'all'}
                                        label={m.watchlist_all()}
                                        onclick={() => setWatchlistFilter('media', 'all')}
                                    />
                                    <MenuRadio
                                        selected={$watchlistFilters.media === 'series'}
                                        label={m.watchlist_series()}
                                        onclick={() => setWatchlistFilter('media', 'series')}
                                    />
                                    <MenuRadio
                                        selected={$watchlistFilters.media === 'movie'}
                                        label={m.watchlist_movies()}
                                        onclick={() => setWatchlistFilter('media', 'movie')}
                                    />
                                </div>
                            {:else}
                                <Button
                                    type="button"
                                    role="menuitem"
                                    class="flex min-h-11 w-full items-center gap-2 px-5 text-left text-xs font-bold text-foreground uppercase hover:bg-panel-hover focus:bg-panel-hover focus:outline-none"
                                    onclick={(event) => {
                                        event.stopPropagation();
                                        filterView = 'main';
                                    }}
                                >
                                    <CaretLeftIcon size="0.95rem" weight="bold" aria-hidden="true" />
                                    {m.watchlist_type()}
                                </Button>
                                <MenuRadio
                                    selected={$watchlistFilters.type === 'all'}
                                    label={m.watchlist_all()}
                                    onclick={() => setWatchlistFilter('type', 'all')}
                                />
                                <MenuRadio
                                    selected={$watchlistFilters.type === 'airing'}
                                    label={m.watchlist_airing()}
                                    onclick={() => setWatchlistFilter('type', 'airing')}
                                />
                                <MenuRadio
                                    selected={$watchlistFilters.type === 'finished'}
                                    label={m.watchlist_finished()}
                                    onclick={() => setWatchlistFilter('type', 'finished')}
                                />
                                <MenuRadio
                                    selected={$watchlistFilters.type === 'not_yet_released'}
                                    label={m.watchlist_not_released()}
                                    onclick={() => setWatchlistFilter('type', 'not_yet_released')}
                                />
                                <MenuRadio
                                    selected={$watchlistFilters.type === 'cancelled'}
                                    label={m.watchlist_cancelled()}
                                    onclick={() => setWatchlistFilter('type', 'cancelled')}
                                />
                                <MenuRadio
                                    selected={$watchlistFilters.type === 'hiatus'}
                                    label={m.watchlist_hiatus()}
                                    onclick={() => setWatchlistFilter('type', 'hiatus')}
                                />
                            {/if}
                        </div>
                    {/snippet}
                </Dropdown>

                <Dropdown id="watchlist-sort" className="mb-2 w-56 *:p-0">
                    {#snippet trigger()}
                        <ListBulletsIcon size="1.2rem" weight="bold" aria-hidden="true" />
                        <span class="hidden sm:inline">
                            {#if $watchlistFilters.sort === 'updated'}
                                {m.watchlist_updated()}
                            {:else if $watchlistFilters.sort === 'added'}
                                {m.watchlist_added()}
                            {:else}
                                {m.watchlist_alphabetical()}
                            {/if}
                        </span>
                    {/snippet}

                    {#snippet children()}
                        <div role="menu" aria-label={m.watchlist_sorting()}>
                            <div role="group" aria-label={m.watchlist_sorting()}>
                                <MenuRadio
                                    selected={$watchlistFilters.sort === 'updated'}
                                    label={m.watchlist_updated()}
                                    onclick={() => setWatchlistFilter('sort', 'updated')}
                                />
                                <MenuRadio
                                    selected={$watchlistFilters.sort === 'added'}
                                    label={m.watchlist_added()}
                                    onclick={() => setWatchlistFilter('sort', 'added')}
                                />
                                <MenuRadio
                                    selected={$watchlistFilters.sort === 'alphabetical'}
                                    label={m.watchlist_alphabetical()}
                                    onclick={() => setWatchlistFilter('sort', 'alphabetical')}
                                />
                            </div>

                            <div role="group" aria-label={m.watchlist_sort_order()}>
                                <p class="px-5 pt-5 pb-2 text-xs font-bold text-foreground uppercase">
                                    {m.watchlist_sort_order()}
                                </p>
                                <MenuRadio
                                    selected={$watchlistFilters.order === 'newest'}
                                    label={m.watchlist_newest()}
                                    onclick={() => setWatchlistFilter('order', 'newest')}
                                />
                                <MenuRadio
                                    selected={$watchlistFilters.order === 'oldest'}
                                    label={m.watchlist_oldest()}
                                    onclick={() => setWatchlistFilter('order', 'oldest')}
                                />
                            </div>
                        </div>
                    {/snippet}
                </Dropdown>
            {/if}
        </div>

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
                    <a
                        href="/"
                        class="inline-flex min-h-11 items-center bg-accent px-5 text-xs font-bold text-on-accent uppercase transition-[filter,transform] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97]"
                    >
                        {m.watchlist_explore()}
                    </a>
                {/snippet}
            </EmptyState>
        {:else}
            <section class="mt-8" aria-labelledby="watchlist-results-title">
                <h2 id="watchlist-results-title" class="sr-only">{m.watchlist_title()}</h2>
                {#if filteredEntries.length === 0}
                    <EmptyState
                        artwork={filteredEmptyArtwork}
                        artworkWidth={622}
                        artworkHeight={640}
                        id="empty-filter-message"
                        body={$watchlistFilters.state === 'watching'
                            ? m.watchlist_empty_watching()
                            : $watchlistFilters.state === 'plan_to_watch'
                              ? m.watchlist_empty_plan()
                              : $watchlistFilters.state === 'completed'
                                ? m.watchlist_empty_completed()
                                : $watchlistFilters.state === 'dropped'
                                  ? m.watchlist_empty_dropped()
                                  : m.watchlist_filtered_empty()}
                    >
                        {#snippet action()}
                            <button
                                type="button"
                                class="inline-flex min-h-11 items-center appearance-none border-0 bg-accent px-5 text-xs font-bold text-on-accent uppercase transition-[filter,transform] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97]"
                                onclick={() => setWatchlistFilter('state', 'all')}
                            >
                                {m.watchlist_view_all()}
                            </button>
                        {/snippet}
                    </EmptyState>
                {:else}
                    <div
                        class="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-7.5 lg:gap-y-12 xl:grid-cols-6 2xl:grid-cols-7"
                    >
                        {#each filteredEntries.filter((entry) => !watchlist.loaded || watchlist.state(entry.id)) as entry (entry.id)}
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
