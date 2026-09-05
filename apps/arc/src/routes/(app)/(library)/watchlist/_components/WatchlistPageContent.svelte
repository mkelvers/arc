<script lang="ts">
    import { goto } from '$app/navigation';
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
    import Button from '$lib/components/ui/button/button.svelte';
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
    const selectedStateLabel = $derived(filters.find(({ value }) => value === data.selection.state)?.label);
    const selectedSortLabel = $derived(sorts.find(({ value }) => value === data.selection.sort)?.label);
    let filterView = $state<'main' | 'type'>('main');

    async function updateSelection(patch: Partial<typeof data.selection>) {
        const selection = { ...data.selection, ...patch };
        const defaults = {
            state: 'all',
            sort: 'updated',
            order: 'newest',
            language: 'all',
            media: 'all',
            type: 'all',
        } as const;
        const query = new URLSearchParams();

        for (const key of Object.keys(selection) as Array<keyof typeof selection>) {
            if (selection[key] !== defaults[key]) {
                query.set(key, selection[key]);
            }
        }

        await goto(query.size ? `/watchlist?${query}` : '/watchlist', {
            keepFocus: true,
            noScroll: true,
        });
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
                    menuAlign="start"
                    menuClass="mt-2 w-56 shadow-xl"
                    triggerClass="flex h-12 min-w-0 w-full cursor-pointer items-center justify-between gap-3 px-1 text-sm font-medium text-foreground uppercase transition-colors hover:text-accent data-[state=open]:text-accent"
                >
                    {#snippet trigger()}
                        <span class="truncate">{selectedStateLabel}</span>
                        <CaretDownIcon class="shrink-0" size="0.8rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                    {#snippet content()}
                        <div role="menu" aria-label={m.watchlist_statuses()} class="bg-panel py-2">
                            {#each filters as filter}
                                <Button
                                    variant="ghost"
                                    size="lg"
                                    role="menuitemradio"
                                    aria-checked={data.selection.state === filter.value}
                                    class="h-auto min-h-11 w-full justify-start rounded-none px-5 py-3 text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground"
                                    onclick={() => updateSelection({ state: filter.value })}
                                >
                                    {filter.label}
                                </Button>
                            {/each}
                        </div>
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
                            <Button
                                variant="ghost"
                                size="lg"
                                class={`h-12 rounded-none border-b-2 px-0 text-sm font-medium text-muted hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent ${data.selection.state === filter.value ? 'border-accent text-foreground' : 'border-transparent'}`}
                                aria-pressed={data.selection.state === filter.value}
                                onclick={() => updateSelection({ state: filter.value })}
                            >
                                {filter.label}
                            </Button>
                        </li>
                    {/each}
                </ul>
            </nav>

            {#if data.totalEntries}
                <Dropdown
                    id="watchlist-filter"
                    ariaLabel={m.watchlist_filter()}
                    menuClass="mt-2 w-64 shadow-xl"
                    triggerClass="mb-2 ml-1 flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted uppercase transition-colors hover:bg-surface hover:text-foreground data-[state=open]:bg-surface data-[state=open]:text-foreground"
                >
                    {#snippet trigger()}
                        <FunnelIcon size="1.2rem" weight="bold" aria-hidden="true" />
                        <span class="hidden sm:inline">{m.watchlist_filter()}</span>
                    {/snippet}

                    {#snippet content()}
                        <div role="menu" aria-label={m.watchlist_filtering()} class="py-2">
                            {#if filterView === 'main'}
                                <Button
                                    variant="ghost"
                                    size="lg"
                                    type="button"
                                    role="menuitem"
                                    aria-haspopup="menu"
                                    aria-expanded="false"
                                    class="h-auto min-h-11 w-full justify-between rounded-none px-5 py-3 text-left text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground"
                                    onclick={(event) => {
                                        event.stopPropagation();
                                        filterView = 'type';
                                    }}
                                >
                                    <span>{m.watchlist_type()}</span>
                                    <span class="flex items-center gap-1 text-foreground">
                                        {types.find(({ value }) => value === data.selection.type)?.label}
                                        <CaretRightIcon size="0.85rem" weight="bold" aria-hidden="true" />
                                    </span>
                                </Button>

                                {#each filterGroups as group}
                                    <p class="px-5 pt-3 pb-2 text-xs font-bold text-foreground uppercase">
                                        {group.label}
                                    </p>
                                    {#each group.options as option}
                                        <Button
                                            variant="ghost"
                                            size="lg"
                                            role="menuitemradio"
                                            aria-checked={data.selection[group.key] === option.value}
                                            class={`h-auto min-h-11 w-full justify-start gap-2.5 rounded-none px-5 py-3 text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground ${data.selection[group.key] === option.value ? 'text-foreground' : ''}`}
                                            onclick={() =>
                                                updateSelection(
                                                    group.key === 'language'
                                                        ? { language: option.value as WatchlistLanguage }
                                                        : { media: option.value as WatchlistMedia }
                                                )}
                                        >
                                            {#if data.selection[group.key] === option.value}
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
                                        </Button>
                                    {/each}
                                {/each}
                            {:else}
                                <Button
                                    variant="ghost"
                                    size="lg"
                                    type="button"
                                    role="menuitem"
                                    class="h-auto min-h-11 w-full justify-start gap-2 rounded-none px-5 py-3 text-left text-xs font-bold text-foreground uppercase hover:bg-panel-hover focus:bg-panel-hover"
                                    onclick={(event) => {
                                        event.stopPropagation();
                                        filterView = 'main';
                                    }}
                                >
                                    <CaretLeftIcon size="0.95rem" weight="bold" aria-hidden="true" />
                                    Type
                                </Button>
                                {#each types as option}
                                    <Button
                                        variant="ghost"
                                        size="lg"
                                        role="menuitemradio"
                                        aria-checked={data.selection.type === option.value}
                                        class={`h-auto min-h-11 w-full justify-start gap-2.5 rounded-none px-5 py-3 text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground ${data.selection.type === option.value ? 'text-foreground' : ''}`}
                                        onclick={() => updateSelection({ type: option.value })}
                                    >
                                        {#if data.selection.type === option.value}
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
                                    </Button>
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
                                <Button
                                    variant="ghost"
                                    size="lg"
                                    role="menuitemradio"
                                    aria-checked={data.selection.sort === sort.value}
                                    class={`h-auto min-h-11 w-full justify-start gap-2.5 rounded-none px-5 py-3 text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground ${data.selection.sort === sort.value ? 'text-foreground' : ''}`}
                                    onclick={() => updateSelection({ sort: sort.value })}
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
                                </Button>
                            {/each}

                            <p class="px-5 pt-5 pb-2 text-xs font-bold text-foreground uppercase">
                                {m.watchlist_sort_order()}
                            </p>
                            {#each orders as order}
                                <Button
                                    variant="ghost"
                                    size="lg"
                                    role="menuitemradio"
                                    aria-checked={data.selection.order === order.value}
                                    class={`h-auto min-h-11 w-full justify-start gap-2.5 rounded-none px-5 py-3 text-sm text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground ${data.selection.order === order.value ? 'text-foreground' : ''}`}
                                    onclick={() => updateSelection({ order: order.value })}
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
                                </Button>
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
                body={m.watchlist_empty_body()}
            >
                {#snippet action()}
                    <Button
                        variant="default"
                        size="lg"
                        href="/"
                        class="text-xs font-bold uppercase active:scale-[0.97]"
                    >
                        Explore Anime
                    </Button>
                {/snippet}
            </EmptyState>
        {:else}
            <section class="mt-8" aria-labelledby="watchlist-results-title">
                <h2 id="watchlist-results-title" class="sr-only">{selectedStateLabel} anime</h2>
                {#if data.entries.length === 0}
                    <EmptyState
                        artwork={filteredEmptyArtwork}
                        artworkWidth={622}
                        artworkHeight={640}
                        id="empty-filter-message"
                        body={m.watchlist_filtered_empty()}
                    >
                        {#snippet action()}
                            <Button
                                variant="default"
                                size="lg"
                                class="text-xs font-bold uppercase active:scale-[0.97]"
                                onclick={() => updateSelection({ state: 'all' })}
                            >
                                {m.watchlist_view_all()}
                            </Button>
                        {/snippet}
                    </EmptyState>
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
