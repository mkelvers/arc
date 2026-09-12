<script lang="ts">
    import { CaretDownIcon, FunnelIcon, ListBulletsIcon } from 'phosphor-svelte';

    import emptyArtwork from '$lib/assets/watchlist-empty.webp';
    import filteredEmptyArtwork from '$lib/assets/watchlist-filter-empty.webp';
    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import Button from '$lib/components/ui/button/button.svelte';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import EmptyState from '$lib/components/ui/EmptyState.svelte';
    import { m } from '$lib/i18n.svelte';
    import { watchlist } from '$lib/watchlist.svelte';
    import { filterWatchlist, setWatchlistFilter, watchlistFilters } from '$lib/watchlist-filters';
    import type { PageData } from '../$types';
    import WatchlistPendingCard from './WatchlistPendingCard.svelte';

    type PageResult = Awaited<PageData['page']>;
    type Page = Extract<PageResult, { status: 'success' }>['data'];
    type Props = { data: Page };

    let { data }: Props = $props();

    let filteredEntries = $derived(filterWatchlist(data.entries, $watchlistFilters));
</script>

<main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
    <div class="mx-auto w-full max-w-384 px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
        <h1 class="text-2xl font-semibold">{m.watchlist_title()}</h1>

        <div class="mt-8 flex min-w-0 items-end border-b border-border sm:mt-10">
            <div class="min-w-0 flex-1 sm:hidden">
                <Dropdown id="watchlist-status-mobile">
                    {#snippet trigger(triggerProps)}
                        <Button
                            {...triggerProps}
                            variant="unstyled"
                            aria-label={m.watchlist_statuses()}
                            class="appearance-none p-0 flex h-12 min-w-0 w-full cursor-pointer items-center justify-between gap-3 px-1 text-sm font-medium text-foreground uppercase transition-colors hover:text-accent data-[state=open]:text-accent"
                        >
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
                        </Button>
                    {/snippet}
                    {#snippet content(menuProps)}
                        <div
                            {...menuProps}
                            role="menu"
                            aria-label={m.watchlist_statuses()}
                            class="absolute top-full left-0 z-50 mt-2 w-56 bg-panel py-2 shadow-xl"
                        >
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
                                class="block w-full appearance-none border-0 bg-transparent whitespace-nowrap px-5 py-3 text-left text-sm leading-tight text-muted hover:bg-panel-hover focus:bg-panel-hover focus:text-foreground focus:outline-none"
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
                            class="inline-flex h-12 appearance-none items-center border-0 border-b-2 bg-transparent text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
                            class="inline-flex h-12 appearance-none items-center border-0 border-b-2 bg-transparent text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
                            class="inline-flex h-12 appearance-none items-center border-0 border-b-2 bg-transparent text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
                            class="inline-flex h-12 appearance-none items-center border-0 border-b-2 bg-transparent text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-current={$watchlistFilters.state === 'dropped' ? 'page' : undefined}
                            onclick={() => setWatchlistFilter('state', 'dropped')}
                        >
                            {m.watchlist_dropped()}
                        </button>
                    </li>
                </ul>
            </nav>

            {#if data.totalEntries}
                <Dropdown id="watchlist-filter" closeOnSelection={false}>
                    {#snippet trigger(triggerProps)}
                        <Button
                            {...triggerProps}
                            variant="unstyled"
                            aria-label={m.watchlist_filtering()}
                            class="appearance-none p-0 mb-2 ml-1 flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted uppercase transition-colors hover:bg-surface hover:text-foreground data-[state=open]:bg-surface data-[state=open]:text-foreground"
                        >
                            <FunnelIcon size="1.2rem" weight="bold" aria-hidden="true" />
                            <span class="hidden sm:inline">{m.watchlist_filter()}</span>
                            {#if $watchlistFilters.language !== 'all' || $watchlistFilters.media !== 'all' || $watchlistFilters.type !== 'all'}
                                <span class="text-accent">
                                    {Number($watchlistFilters.language !== 'all') +
                                        Number($watchlistFilters.media !== 'all') +
                                        Number($watchlistFilters.type !== 'all')}
                                </span>
                            {/if}
                        </Button>
                    {/snippet}

                    {#snippet content(menuProps)}
                        <div
                            {...menuProps}
                            role="group"
                            aria-label={m.watchlist_filtering()}
                            class="absolute top-full right-0 z-50 w-64 space-y-1 bg-panel py-2 shadow-xl"
                        >
                            <Dropdown id="watchlist-language">
                                {#snippet trigger(triggerProps)}
                                    <Button
                                        {...triggerProps}
                                        variant="unstyled"
                                        class="flex min-h-11 w-full items-center justify-between px-5 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    >
                                        <span>{m.watchlist_language()}</span>
                                        <span class="text-foreground">
                                            {#if $watchlistFilters.language === 'sub'}
                                                {m.watchlist_subtitled()}
                                            {:else if $watchlistFilters.language === 'dub'}
                                                {m.watchlist_dubbed()}
                                            {:else}
                                                {m.watchlist_all()}
                                            {/if}
                                        </span>
                                    </Button>
                                {/snippet}
                                {#snippet content(menuProps)}
                                    <div
                                        {...menuProps}
                                        role="menu"
                                        aria-label={m.watchlist_language()}
                                        class="absolute top-full left-0 z-50 mt-1 w-56 bg-panel py-2 shadow-xl"
                                    >
                                        <button
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={$watchlistFilters.language === 'all'}
                                            class:text-foreground={$watchlistFilters.language === 'all'}
                                            class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                            onclick={() => setWatchlistFilter('language', 'all')}
                                        >
                                            {m.watchlist_all()}
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={$watchlistFilters.language === 'sub'}
                                            class:text-foreground={$watchlistFilters.language === 'sub'}
                                            class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                            onclick={() => setWatchlistFilter('language', 'sub')}
                                        >
                                            {m.watchlist_subtitled()}
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={$watchlistFilters.language === 'dub'}
                                            class:text-foreground={$watchlistFilters.language === 'dub'}
                                            class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                            onclick={() => setWatchlistFilter('language', 'dub')}
                                        >
                                            {m.watchlist_dubbed()}
                                        </button>
                                    </div>
                                {/snippet}
                            </Dropdown>

                            <Dropdown id="watchlist-media">
                                {#snippet trigger(triggerProps)}
                                    <Button
                                        {...triggerProps}
                                        variant="unstyled"
                                        class="flex min-h-11 w-full items-center justify-between px-5 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    >
                                        <span>{m.watchlist_media()}</span>
                                        <span class="text-foreground">
                                            {#if $watchlistFilters.media === 'series'}
                                                {m.watchlist_series()}
                                            {:else if $watchlistFilters.media === 'movie'}
                                                {m.watchlist_movies()}
                                            {:else}
                                                {m.watchlist_all()}
                                            {/if}
                                        </span>
                                    </Button>
                                {/snippet}
                                {#snippet content(menuProps)}
                                    <div
                                        {...menuProps}
                                        role="menu"
                                        aria-label={m.watchlist_media()}
                                        class="absolute top-full left-0 z-50 mt-1 w-56 bg-panel py-2 shadow-xl"
                                    >
                                        <button
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={$watchlistFilters.media === 'all'}
                                            class:text-foreground={$watchlistFilters.media === 'all'}
                                            class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                            onclick={() => setWatchlistFilter('media', 'all')}
                                        >
                                            {m.watchlist_all()}
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={$watchlistFilters.media === 'series'}
                                            class:text-foreground={$watchlistFilters.media === 'series'}
                                            class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                            onclick={() => setWatchlistFilter('media', 'series')}
                                        >
                                            {m.watchlist_series()}
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={$watchlistFilters.media === 'movie'}
                                            class:text-foreground={$watchlistFilters.media === 'movie'}
                                            class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                            onclick={() => setWatchlistFilter('media', 'movie')}
                                        >
                                            {m.watchlist_movies()}
                                        </button>
                                    </div>
                                {/snippet}
                            </Dropdown>

                            <Dropdown id="watchlist-type">
                                {#snippet trigger(triggerProps)}
                                    <Button
                                        {...triggerProps}
                                        variant="unstyled"
                                        class="flex min-h-11 w-full items-center justify-between px-5 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    >
                                        <span>{m.watchlist_type()}</span>
                                        <span class="text-foreground">
                                            {#if $watchlistFilters.type === 'airing'}
                                                {m.watchlist_airing()}
                                            {:else if $watchlistFilters.type === 'finished'}
                                                {m.watchlist_finished()}
                                            {:else if $watchlistFilters.type === 'not_yet_released'}
                                                {m.watchlist_not_released()}
                                            {:else if $watchlistFilters.type === 'cancelled'}
                                                {m.watchlist_cancelled()}
                                            {:else if $watchlistFilters.type === 'hiatus'}
                                                {m.watchlist_hiatus()}
                                            {:else}
                                                {m.watchlist_all()}
                                            {/if}
                                        </span>
                                    </Button>
                                {/snippet}
                                {#snippet content(menuProps)}
                                    <div
                                        {...menuProps}
                                        role="menu"
                                        aria-label={m.watchlist_type()}
                                        class="absolute top-full left-0 z-50 mt-1 w-56 bg-panel py-2 shadow-xl"
                                    >
                                        <button
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={$watchlistFilters.type === 'all'}
                                            class:text-foreground={$watchlistFilters.type === 'all'}
                                            class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                            onclick={() => setWatchlistFilter('type', 'all')}
                                        >
                                            {m.watchlist_all()}
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={$watchlistFilters.type === 'airing'}
                                            class:text-foreground={$watchlistFilters.type === 'airing'}
                                            class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                            onclick={() => setWatchlistFilter('type', 'airing')}
                                        >
                                            {m.watchlist_airing()}
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={$watchlistFilters.type === 'finished'}
                                            class:text-foreground={$watchlistFilters.type === 'finished'}
                                            class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                            onclick={() => setWatchlistFilter('type', 'finished')}
                                        >
                                            {m.watchlist_finished()}
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={$watchlistFilters.type === 'not_yet_released'}
                                            class:text-foreground={$watchlistFilters.type === 'not_yet_released'}
                                            class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                            onclick={() => setWatchlistFilter('type', 'not_yet_released')}
                                        >
                                            {m.watchlist_not_released()}
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={$watchlistFilters.type === 'cancelled'}
                                            class:text-foreground={$watchlistFilters.type === 'cancelled'}
                                            class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                            onclick={() => setWatchlistFilter('type', 'cancelled')}
                                        >
                                            {m.watchlist_cancelled()}
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={$watchlistFilters.type === 'hiatus'}
                                            class:text-foreground={$watchlistFilters.type === 'hiatus'}
                                            class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                            onclick={() => setWatchlistFilter('type', 'hiatus')}
                                        >
                                            {m.watchlist_hiatus()}
                                        </button>
                                    </div>
                                {/snippet}
                            </Dropdown>
                        </div>
                    {/snippet}
                </Dropdown>
                <Dropdown id="watchlist-sort">
                    {#snippet trigger(triggerProps)}
                        <Button
                            {...triggerProps}
                            variant="unstyled"
                            aria-label={m.watchlist_sorting()}
                            class="appearance-none p-0 mb-2 flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted uppercase transition-colors hover:bg-surface hover:text-foreground data-[state=open]:bg-surface data-[state=open]:text-foreground"
                        >
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
                        </Button>
                    {/snippet}

                    {#snippet content(menuProps)}
                        <div
                            {...menuProps}
                            role="menu"
                            aria-label={m.watchlist_sorting()}
                            class="absolute top-full right-0 z-50 mt-2 w-56 bg-panel py-2 shadow-xl"
                        >
                            <div role="group" aria-label={m.watchlist_sorting()}>
                                <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={$watchlistFilters.sort === 'updated'}
                                    class:text-foreground={$watchlistFilters.sort === 'updated'}
                                    class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    onclick={() => setWatchlistFilter('sort', 'updated')}
                                >
                                    {m.watchlist_updated()}
                                </button>
                                <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={$watchlistFilters.sort === 'added'}
                                    class:text-foreground={$watchlistFilters.sort === 'added'}
                                    class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    onclick={() => setWatchlistFilter('sort', 'added')}
                                >
                                    {m.watchlist_added()}
                                </button>
                                <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={$watchlistFilters.sort === 'alphabetical'}
                                    class:text-foreground={$watchlistFilters.sort === 'alphabetical'}
                                    class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    onclick={() => setWatchlistFilter('sort', 'alphabetical')}
                                >
                                    {m.watchlist_alphabetical()}
                                </button>
                            </div>

                            <div role="group" aria-label={m.watchlist_sort_order()}>
                                <p class="px-5 pt-5 pb-2 text-xs font-bold text-foreground uppercase">
                                    {m.watchlist_sort_order()}
                                </p>
                                <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={$watchlistFilters.order === 'newest'}
                                    class:text-foreground={$watchlistFilters.order === 'newest'}
                                    class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    onclick={() => setWatchlistFilter('order', 'newest')}
                                >
                                    {m.watchlist_newest()}
                                </button>
                                <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={$watchlistFilters.order === 'oldest'}
                                    class:text-foreground={$watchlistFilters.order === 'oldest'}
                                    class="flex min-h-11 w-full appearance-none items-center border-0 bg-transparent px-5 text-left text-sm text-muted hover:bg-panel-hover focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    onclick={() => setWatchlistFilter('order', 'oldest')}
                                >
                                    {m.watchlist_oldest()}
                                </button>
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
