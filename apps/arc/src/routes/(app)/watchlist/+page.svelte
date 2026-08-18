<script lang="ts">
    import {
        CaretDownIcon,
        CaretLeftIcon,
        CaretRightIcon,
        CircleIcon,
        FunnelIcon,
        ListBulletsIcon,
        RadioButtonIcon,
    } from 'phosphor-svelte';

    import emptyArtwork from '$lib/assets/watchlist-empty.png';
    import filteredEmptyArtwork from '$lib/assets/watchlist-filter-empty.png';
    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import EmptyState from '$lib/components/ui/EmptyState.svelte';
    import {
        watchlistStates,
        type WatchlistLanguage,
        type WatchlistMedia,
        type WatchlistOrder,
        type WatchlistSort,
        type WatchlistState,
        type WatchlistType,
    } from '$lib/watchlist';
    import { watchlist } from '$lib/watchlist.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    const filters = [{ value: 'all', label: 'All' }, ...watchlistStates] as const satisfies ReadonlyArray<{
        value: WatchlistState | 'all';
        label: string;
    }>;
    const sorts = [
        { value: 'updated', label: 'Updated' },
        { value: 'added', label: 'Added' },
        { value: 'alphabetical', label: 'Alphabetical' },
    ] as const satisfies ReadonlyArray<{ value: WatchlistSort; label: string }>;
    const orders = [
        { value: 'newest', label: 'Newest' },
        { value: 'oldest', label: 'Oldest' },
    ] as const satisfies ReadonlyArray<{ value: WatchlistOrder; label: string }>;
    const languages = [
        { value: 'all', label: 'All' },
        { value: 'sub', label: 'Subtitled' },
        { value: 'dub', label: 'Dubbed' },
    ] as const satisfies ReadonlyArray<{ value: WatchlistLanguage; label: string }>;
    const media = [
        { value: 'all', label: 'All' },
        { value: 'series', label: 'Series' },
        { value: 'movie', label: 'Movies' },
    ] as const satisfies ReadonlyArray<{ value: WatchlistMedia; label: string }>;
    const types = [
        { value: 'all', label: 'All' },
        { value: 'airing', label: 'Currently Airing' },
        { value: 'finished', label: 'Finished' },
        { value: 'not_yet_released', label: 'Not Yet Released' },
        { value: 'cancelled', label: 'Cancelled' },
        { value: 'hiatus', label: 'On Hiatus' },
    ] as const satisfies ReadonlyArray<{ value: WatchlistType; label: string }>;
    type FilterKey = 'language' | 'media' | 'type';
    const filterGroups = [
        { label: 'Language', options: languages, key: 'language' },
        { label: 'Media', options: media, key: 'media' },
    ] as const satisfies ReadonlyArray<{
        label: string;
        key: FilterKey;
        options: ReadonlyArray<{ label: string; value: string }>;
    }>;
    const selectedStateLabel = $derived(
        filters.find(({ value }) => value === data.selection.state)?.label ?? 'All'
    );
    const selectedSortLabel = $derived(
        sorts.find(({ value }) => value === data.selection.sort)?.label ?? 'Updated'
    );
    const selectedFilterCount = $derived(
        Number(data.selection.language !== 'all') +
            Number(data.selection.media !== 'all') +
            Number(data.selection.type !== 'all')
    );
    const selectedTypeLabel = $derived(types.find(({ value }) => value === data.selection.type)?.label ?? 'All');
    let filterView = $state<'main' | 'type'>('main');
    const filteredEmptyCopy = $derived.by(() => {
        switch (data.selection.state) {
            case 'watching':
                return 'Your next great watch is still out there. Add something and it’ll appear here.';
            case 'plan_to_watch':
                return 'Future-you will be glad you saved something. Add an anime and it’ll wait here.';
            case 'completed':
                return 'A shelf for your victories is waiting. Finish an anime and it’ll proudly appear here.';
            case 'dropped':
                return 'Even dropped anime deserve a little shelf space. They’ll be here if you change your mind.';
            default:
                return 'Nothing matched those filters this time. Try another status or give them a little breathing room.';
        }
    });

    function selectionHref(
        patch: Partial<{
            state: WatchlistState | 'all';
            sort: WatchlistSort;
            order: WatchlistOrder;
            language: WatchlistLanguage;
            media: WatchlistMedia;
            type: WatchlistType;
        }>
    ) {
        const selection = { ...data.selection, ...patch };
        const query = new URLSearchParams();

        if (selection.state !== 'all') {
            query.set('state', selection.state);
        }
        if (selection.sort !== 'updated') {
            query.set('sort', selection.sort);
        }
        if (selection.order !== 'newest') {
            query.set('order', selection.order);
        }
        if (selection.language !== 'all') {
            query.set('language', selection.language);
        }
        if (selection.media !== 'all') {
            query.set('media', selection.media);
        }
        if (selection.type !== 'all') {
            query.set('type', selection.type);
        }

        const search = query.toString();
        return search ? `/watchlist?${search}` : '/watchlist';
    }

    function filterSelected(key: FilterKey, value: string) {
        return data.selection[key] === value;
    }

    function filterHref(key: FilterKey, value: string) {
        switch (key) {
            case 'language':
                return selectionHref({ language: value as WatchlistLanguage });
            case 'media':
                return selectionHref({ media: value as WatchlistMedia });
            case 'type':
                return selectionHref({ type: value as WatchlistType });
        }
    }
</script>

<svelte:head>
    <title>Arc — Watchlist</title>
    <meta
        name="description"
        content="Keep track of the anime you want to watch, are watching, and have finished."
    />
</svelte:head>

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

            {#if data.totalEntries}
                <Dropdown
                    id="watchlist-filter"
                    ariaLabel={`Filter watchlist${selectedFilterCount ? `, ${selectedFilterCount} selected` : ''}`}
                    menuClass="mt-2 w-64 shadow-xl"
                    triggerClass="mb-2 ml-1 flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted uppercase transition-colors hover:bg-surface hover:text-foreground peer-checked:bg-surface peer-checked:text-foreground"
                >
                    {#snippet trigger()}
                        <FunnelIcon size="1.2rem" weight="bold" aria-hidden="true" />
                        <span class="hidden sm:inline">Filter</span>
                        {#if selectedFilterCount}
                            <span class="text-accent">
                                {selectedFilterCount}
                            </span>
                        {/if}
                        <CaretDownIcon size="0.8rem" weight="bold" aria-hidden="true" />
                    {/snippet}

                    {#snippet content()}
                        <div role="menu" aria-label="Watchlist filtering" class="py-2">
                            {#if filterView === 'main'}
                                <button
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
                                    <span>Type</span>
                                    <span class="flex items-center gap-1 text-foreground">
                                        {selectedTypeLabel}
                                        <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
                                    </span>
                                </button>

                                {#each filterGroups as group}
                                    <p class="px-5 pt-3 pb-2 text-xs font-bold text-foreground uppercase">
                                        {group.label}
                                    </p>
                                    {#each group.options as option}
                                        <a
                                            role="menuitemradio"
                                            aria-checked={filterSelected(group.key, option.value)}
                                            href={filterHref(group.key, option.value)}
                                            class:text-foreground={filterSelected(group.key, option.value)}
                                            class="flex min-h-11 items-center gap-2.5 px-5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                        >
                                            {#if filterSelected(group.key, option.value)}
                                                <RadioButtonIcon
                                                    size="1.25rem"
                                                    weight="fill"
                                                    class="text-accent"
                                                    aria-hidden="true"
                                                />
                                            {:else}
                                                <CircleIcon size="1.25rem" weight="regular" aria-hidden="true" />
                                            {/if}
                                            {option.label}
                                        </a>
                                    {/each}
                                {/each}
                            {:else}
                                <button
                                    type="button"
                                    role="menuitem"
                                    class="flex min-h-11 w-full items-center gap-2 px-5 text-left text-xs font-bold text-foreground uppercase hover:bg-panel-hover focus:bg-panel-hover focus:outline-none"
                                    onclick={(event) => {
                                        event.stopPropagation();
                                        filterView = 'main';
                                    }}
                                >
                                    <CaretLeftIcon size="0.95rem" weight="bold" aria-hidden="true" />
                                    Type
                                </button>
                                {#each types as option}
                                    <a
                                        role="menuitemradio"
                                        aria-checked={filterSelected('type', option.value)}
                                        href={filterHref('type', option.value)}
                                        class:text-foreground={filterSelected('type', option.value)}
                                        class="flex min-h-11 items-center gap-2.5 px-5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    >
                                        {#if filterSelected('type', option.value)}
                                            <RadioButtonIcon
                                                size="1.25rem"
                                                weight="fill"
                                                class="text-accent"
                                                aria-hidden="true"
                                            />
                                        {:else}
                                            <CircleIcon size="1.25rem" weight="regular" aria-hidden="true" />
                                        {/if}
                                        {option.label}
                                    </a>
                                {/each}
                            {/if}
                        </div>
                    {/snippet}
                </Dropdown>
                <Dropdown
                    id="watchlist-sort"
                    ariaLabel={`Sort watchlist. ${selectedSortLabel}, ${data.selection.order} selected`}
                    menuClass="mt-2 w-56 shadow-xl"
                    triggerClass="mb-2 ml-1 flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted uppercase transition-colors hover:bg-surface hover:text-foreground peer-checked:bg-surface peer-checked:text-foreground"
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
            <EmptyState
                artwork={emptyArtwork}
                artworkWidth={566}
                artworkHeight={720}
                id="empty-watchlist-title"
                title="Your Watchlist needs some love."
                body="Let’s fill it up with awesome anime."
                actionHref="/"
                actionLabel="Explore Anime"
            />
        {:else}
            <section class="mt-8" aria-label={`${selectedStateLabel} anime`}>
                {#await data.entries then entries}
                    {#if entries.length === 0}
                        <EmptyState
                            artwork={filteredEmptyArtwork}
                            artworkWidth={622}
                            artworkHeight={640}
                            id="empty-filter-message"
                            body={filteredEmptyCopy}
                            actionHref={selectionHref({ state: 'all' })}
                            actionLabel="View All Statuses"
                        />
                    {:else}
                        <div
                            class="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 2xl:gap-x-5"
                        >
                            {#each entries.filter((entry) => !watchlist.loaded || watchlist.state(entry.id)) as entry (entry.id)}
                                <AnimeCard anime={entry} />
                            {/each}
                        </div>
                    {/if}
                {:catch}
                    <p class="py-16 text-center text-muted">Your watchlist could not be loaded.</p>
                {/await}
            </section>
        {/if}
    </div>
</main>
