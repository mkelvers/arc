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
        type WatchlistLanguage,
        type WatchlistMedia,
        type WatchlistOrder,
        type WatchlistSort,
        type WatchlistState,
        type WatchlistType,
    } from '$lib/watchlist';
    import { watchlist } from '$lib/watchlist.svelte';
    import type { PageData } from '../$types';
    import WatchlistPendingCard from './WatchlistPendingCard.svelte';
    import { m } from '$lib/i18n.svelte';

    type PageResult = Awaited<PageData['page']>;
    type Page = Extract<PageResult, { status: 'success' }>['data'];
    type Props = { data: Page & Pick<PageData, 'selection'> };

    let { data }: Props = $props();

    const filters = [
        { value: 'all', label: m.watchlist_all() },
        { value: 'watching', label: m.watchlist_watching() },
        { value: 'plan_to_watch', label: m.watchlist_plan() },
        { value: 'completed', label: m.watchlist_completed() },
        { value: 'dropped', label: m.watchlist_dropped() },
    ] as const satisfies ReadonlyArray<{
        value: WatchlistState | 'all';
        label: string;
    }>;
    const sorts = [
        { value: 'updated', label: m.watchlist_updated() },
        { value: 'added', label: m.watchlist_added() },
        { value: 'alphabetical', label: m.watchlist_alphabetical() },
    ] as const satisfies ReadonlyArray<{ value: WatchlistSort; label: string }>;
    const orders = [
        { value: 'newest', label: m.watchlist_newest() },
        { value: 'oldest', label: m.watchlist_oldest() },
    ] as const satisfies ReadonlyArray<{ value: WatchlistOrder; label: string }>;
    const languages = [
        { value: 'all', label: m.watchlist_all() },
        { value: 'sub', label: m.watchlist_subtitled() },
        { value: 'dub', label: m.watchlist_dubbed() },
    ] as const satisfies ReadonlyArray<{ value: WatchlistLanguage; label: string }>;
    const media = [
        { value: 'all', label: m.watchlist_all() },
        { value: 'series', label: m.watchlist_series() },
        { value: 'movie', label: m.watchlist_movies() },
    ] as const satisfies ReadonlyArray<{ value: WatchlistMedia; label: string }>;
    const types = [
        { value: 'all', label: m.watchlist_all() },
        { value: 'airing', label: m.watchlist_airing() },
        { value: 'finished', label: m.watchlist_finished() },
        { value: 'not_yet_released', label: m.watchlist_not_released() },
        { value: 'cancelled', label: m.watchlist_cancelled() },
        { value: 'hiatus', label: m.watchlist_hiatus() },
    ] as const satisfies ReadonlyArray<{ value: WatchlistType; label: string }>;
    type FilterKey = 'language' | 'media' | 'type';
    const filterGroups = [
        { label: m.settings_subtitles(), options: languages, key: 'language' },
        { label: m.watchlist_type(), options: media, key: 'media' },
    ] as const satisfies ReadonlyArray<{
        label: string;
        key: FilterKey;
        options: ReadonlyArray<{ label: string; value: string }>;
    }>;
    const selectedStateLabel = $derived(
        filters.find(({ value }) => value === data.selection.state)?.label ?? m.watchlist_all()
    );
    const selectedSortLabel = $derived(
        sorts.find(({ value }) => value === data.selection.sort)?.label ?? m.watchlist_updated()
    );
    const selectedFilterCount = $derived(
        Number(data.selection.language !== 'all') +
            Number(data.selection.media !== 'all') +
            Number(data.selection.type !== 'all')
    );
    const selectedTypeLabel = $derived(
        types.find(({ value }) => value === data.selection.type)?.label ?? m.watchlist_all()
    );
    let filterView = $state<'main' | 'type'>('main');
    const filteredEmptyCopy = $derived.by(() => {
        switch (data.selection.state) {
            case 'watching':
                return m.watchlist_empty_watching();
            case 'plan_to_watch':
                return m.watchlist_empty_plan();
            case 'completed':
                return m.watchlist_empty_completed();
            case 'dropped':
                return m.watchlist_empty_dropped();
            default:
                return m.watchlist_filtered_empty();
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

<main class="min-h-[calc(100dvh-3.5rem)] bg-canvas text-foreground">
    <div class="mx-auto w-full max-w-384 px-5 py-9 sm:px-10 sm:py-11 lg:px-16 lg:py-14">
        <h1 class="text-2xl font-semibold">{m.watchlist_title()}</h1>

        <div class="mt-8 flex min-w-0 items-end border-b border-border sm:mt-10">
            <div class="min-w-0 flex-1 sm:hidden">
                <Dropdown
                    id="watchlist-status-mobile"
                    ariaLabel={m.watchlist_statuses()}
                    items={filters.map((filter) => ({
                        label: filter.label,
                        href: selectionHref({ state: filter.value }),
                        current: data.selection.state === filter.value,
                    }))}
                    menuAlign="start"
                    menuClass="mt-2 w-56 shadow-xl"
                    triggerClass="flex h-12 min-w-0 w-full cursor-pointer items-center justify-between gap-3 px-1 text-sm font-medium text-foreground uppercase transition-colors hover:text-accent data-[state=open]:text-accent"
                >
                    {#snippet trigger()}
                        <span class="truncate">{selectedStateLabel}</span>
                        <CaretDownIcon class="shrink-0" size="0.8rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                </Dropdown>
            </div>

            <nav
                class="scrollbar-hidden hidden min-w-0 flex-1 overflow-x-auto sm:block"
                aria-label={m.watchlist_statuses()}
            >
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
                    triggerClass="mb-2 ml-1 flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted uppercase transition-colors hover:bg-surface hover:text-foreground data-[state=open]:bg-surface data-[state=open]:text-foreground"
                >
                    {#snippet trigger()}
                        <FunnelIcon size="1.2rem" weight="bold" aria-hidden="true" />
                        <span class="hidden sm:inline">{m.watchlist_filter()}</span>
                        {#if selectedFilterCount}
                            <span class="text-accent">
                                {selectedFilterCount}
                            </span>
                        {/if}
                    {/snippet}

                    {#snippet content()}
                        <div role="menu" aria-label={m.watchlist_filtering()} class="py-2">
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
                                    <span>{m.watchlist_type()}</span>
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
                                                    class="text-input-accent"
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
                                                class="text-input-accent"
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
                    triggerClass="mb-2 flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted uppercase transition-colors hover:bg-surface hover:text-foreground data-[state=open]:bg-surface data-[state=open]:text-foreground"
                >
                    {#snippet trigger()}
                        <ListBulletsIcon size="1.2rem" weight="bold" aria-hidden="true" />
                        <span class="hidden sm:inline">{selectedSortLabel}</span>
                    {/snippet}

                    {#snippet content()}
                        <div role="menu" aria-label={m.watchlist_sorting()} class="py-2">
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
                                            class="text-input-accent"
                                            aria-hidden="true"
                                        />
                                    {:else}
                                        <CircleIcon size="1.25rem" weight="regular" aria-hidden="true" />
                                    {/if}
                                    {sort.label}
                                </a>
                            {/each}

                            <p class="px-5 pt-5 pb-2 text-xs font-bold text-foreground uppercase">
                                {m.watchlist_sort_order()}
                            </p>
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
                                            class="text-input-accent"
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
                title={m.watchlist_empty_title()}
                body="Let’s fill it up with awesome anime."
                actionHref="/"
                actionLabel="Explore Anime"
            />
        {:else}
            <section class="mt-8" aria-labelledby="watchlist-results-title">
                <h2 id="watchlist-results-title" class="sr-only">{selectedStateLabel} anime</h2>
                {#if data.entries.length === 0}
                    <EmptyState
                        artwork={filteredEmptyArtwork}
                        artworkWidth={622}
                        artworkHeight={640}
                        id="empty-filter-message"
                        body={filteredEmptyCopy}
                        actionHref={selectionHref({ state: 'all' })}
                        actionLabel={m.watchlist_view_all()}
                    />
                {:else}
                    <div
                        class="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-7.5 lg:gap-y-12 xl:grid-cols-6 2xl:grid-cols-7"
                    >
                        {#each data.entries.filter((entry) => !watchlist.loaded || watchlist.state(entry.id)) as entry (entry.id)}
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
