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
    import Button from '$lib/components/ui/button/button.svelte';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import EmptyState from '$lib/components/ui/EmptyState.svelte';
    import MenuOption from '$lib/components/ui/MenuOption.svelte';
    import { watchlist } from '$lib/watchlist.svelte';
    import type { PageData } from '../$types';
    import WatchlistPendingCard from './WatchlistPendingCard.svelte';
    import { m } from '$lib/i18n.svelte';

    type PageResult = Awaited<PageData['page']>;
    type Page = Extract<PageResult, { status: 'success' }>['data'];
    type Props = { data: Page & Pick<PageData, 'selection'> };

    let { data }: Props = $props();

    let filterView = $state<'main' | 'type'>('main');

    function href(patch: Partial<typeof data.selection>) {
        return `/watchlist?${new URLSearchParams({ ...data.selection, ...patch })}`;
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
                        <span class="truncate">
                            {#if data.selection.state === 'all'}
                                {m.watchlist_all()}
                            {:else if data.selection.state === 'watching'}
                                {m.watchlist_watching()}
                            {:else if data.selection.state === 'plan_to_watch'}
                                {m.watchlist_plan()}
                            {:else if data.selection.state === 'completed'}
                                {m.watchlist_completed()}
                            {:else}
                                {m.watchlist_dropped()}
                            {/if}
                        </span>
                        <CaretDownIcon class="shrink-0" size="0.8rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                    {#snippet content()}
                        <div role="menu" aria-label={m.watchlist_statuses()} class="py-2">
                            <a
                                role="menuitem"
                                href={href({ state: 'all' })}
                                aria-current={data.selection.state === 'all' ? 'page' : undefined}
                                class="block whitespace-nowrap px-5 py-3 text-sm leading-tight text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {m.watchlist_all()}
                            </a>
                            <a
                                role="menuitem"
                                href={href({ state: 'watching' })}
                                aria-current={data.selection.state === 'watching' ? 'page' : undefined}
                                class="block whitespace-nowrap px-5 py-3 text-sm leading-tight text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {m.watchlist_watching()}
                            </a>
                            <a
                                role="menuitem"
                                href={href({ state: 'plan_to_watch' })}
                                aria-current={data.selection.state === 'plan_to_watch' ? 'page' : undefined}
                                class="block whitespace-nowrap px-5 py-3 text-sm leading-tight text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {m.watchlist_plan()}
                            </a>
                            <a
                                role="menuitem"
                                href={href({ state: 'completed' })}
                                aria-current={data.selection.state === 'completed' ? 'page' : undefined}
                                class="block whitespace-nowrap px-5 py-3 text-sm leading-tight text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {m.watchlist_completed()}
                            </a>
                            <a
                                role="menuitem"
                                href={href({ state: 'dropped' })}
                                aria-current={data.selection.state === 'dropped' ? 'page' : undefined}
                                class="block whitespace-nowrap px-5 py-3 text-sm leading-tight text-muted hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {m.watchlist_dropped()}
                            </a>
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
                        <a
                            href={href({ state: 'all' })}
                            class:border-accent={data.selection.state === 'all'}
                            class:border-transparent={data.selection.state !== 'all'}
                            class:text-foreground={data.selection.state === 'all'}
                            class="inline-flex h-12 items-center border-b-2 text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-current={data.selection.state === 'all' ? 'page' : undefined}
                        >
                            {m.watchlist_all()}
                        </a>
                    </li>
                    <li>
                        <a
                            href={href({ state: 'watching' })}
                            class:border-accent={data.selection.state === 'watching'}
                            class:border-transparent={data.selection.state !== 'watching'}
                            class:text-foreground={data.selection.state === 'watching'}
                            class="inline-flex h-12 items-center border-b-2 text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-current={data.selection.state === 'watching' ? 'page' : undefined}
                        >
                            {m.watchlist_watching()}
                        </a>
                    </li>
                    <li>
                        <a
                            href={href({ state: 'plan_to_watch' })}
                            class:border-accent={data.selection.state === 'plan_to_watch'}
                            class:border-transparent={data.selection.state !== 'plan_to_watch'}
                            class:text-foreground={data.selection.state === 'plan_to_watch'}
                            class="inline-flex h-12 items-center border-b-2 text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-current={data.selection.state === 'plan_to_watch' ? 'page' : undefined}
                        >
                            {m.watchlist_plan()}
                        </a>
                    </li>
                    <li>
                        <a
                            href={href({ state: 'completed' })}
                            class:border-accent={data.selection.state === 'completed'}
                            class:border-transparent={data.selection.state !== 'completed'}
                            class:text-foreground={data.selection.state === 'completed'}
                            class="inline-flex h-12 items-center border-b-2 text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-current={data.selection.state === 'completed' ? 'page' : undefined}
                        >
                            {m.watchlist_completed()}
                        </a>
                    </li>
                    <li>
                        <a
                            href={href({ state: 'dropped' })}
                            class:border-accent={data.selection.state === 'dropped'}
                            class:border-transparent={data.selection.state !== 'dropped'}
                            class:text-foreground={data.selection.state === 'dropped'}
                            class="inline-flex h-12 items-center border-b-2 text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-current={data.selection.state === 'dropped' ? 'page' : undefined}
                        >
                            {m.watchlist_dropped()}
                        </a>
                    </li>
                </ul>
            </nav>

            {#if data.totalEntries}
                <Dropdown
                    id="watchlist-filter"
                    ariaLabel={m.watchlist_filtering()}
                    menuClass="mt-2 w-64 shadow-xl"
                    triggerClass="mb-2 ml-1 flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted uppercase transition-colors hover:bg-surface hover:text-foreground data-[state=open]:bg-surface data-[state=open]:text-foreground"
                >
                    {#snippet trigger()}
                        <FunnelIcon size="1.2rem" weight="bold" aria-hidden="true" />
                        <span class="hidden sm:inline">{m.watchlist_filter()}</span>
                        {#if data.selection.language !== 'all' || data.selection.media !== 'all' || data.selection.type !== 'all'}
                            <span class="text-accent">
                                {Number(data.selection.language !== 'all') +
                                    Number(data.selection.media !== 'all') +
                                    Number(data.selection.type !== 'all')}
                            </span>
                        {/if}
                    {/snippet}

                    {#snippet content()}
                        <div role="menu" aria-label={m.watchlist_filtering()} class="py-2">
                            {#if filterView === 'main'}
                                <Button
                                    variant="unstyled"
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
                                        {#if data.selection.type === 'all'}
                                            {m.watchlist_all()}
                                        {:else if data.selection.type === 'airing'}
                                            {m.watchlist_airing()}
                                        {:else if data.selection.type === 'finished'}
                                            {m.watchlist_finished()}
                                        {:else if data.selection.type === 'not_yet_released'}
                                            {m.watchlist_not_released()}
                                        {:else if data.selection.type === 'cancelled'}
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
                                    <MenuOption
                                        href={href({ language: 'all' })}
                                        selected={data.selection.language === 'all'}
                                        label={m.watchlist_all()}
                                    />
                                    <MenuOption
                                        href={href({ language: 'sub' })}
                                        selected={data.selection.language === 'sub'}
                                        label={m.watchlist_subtitled()}
                                    />
                                    <MenuOption
                                        href={href({ language: 'dub' })}
                                        selected={data.selection.language === 'dub'}
                                        label={m.watchlist_dubbed()}
                                    />
                                </div>

                                <div role="group" aria-label={m.watchlist_media()}>
                                    <p class="px-5 pt-3 pb-2 text-xs font-bold text-foreground uppercase">
                                        {m.watchlist_media()}
                                    </p>
                                    <MenuOption
                                        href={href({ media: 'all' })}
                                        selected={data.selection.media === 'all'}
                                        label={m.watchlist_all()}
                                    />
                                    <MenuOption
                                        href={href({ media: 'series' })}
                                        selected={data.selection.media === 'series'}
                                        label={m.watchlist_series()}
                                    />
                                    <MenuOption
                                        href={href({ media: 'movie' })}
                                        selected={data.selection.media === 'movie'}
                                        label={m.watchlist_movies()}
                                    />
                                </div>
                            {:else}
                                <Button
                                    variant="unstyled"
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
                                <MenuOption
                                    href={href({ type: 'all' })}
                                    selected={data.selection.type === 'all'}
                                    label={m.watchlist_all()}
                                />
                                <MenuOption
                                    href={href({ type: 'airing' })}
                                    selected={data.selection.type === 'airing'}
                                    label={m.watchlist_airing()}
                                />
                                <MenuOption
                                    href={href({ type: 'finished' })}
                                    selected={data.selection.type === 'finished'}
                                    label={m.watchlist_finished()}
                                />
                                <MenuOption
                                    href={href({ type: 'not_yet_released' })}
                                    selected={data.selection.type === 'not_yet_released'}
                                    label={m.watchlist_not_released()}
                                />
                                <MenuOption
                                    href={href({ type: 'cancelled' })}
                                    selected={data.selection.type === 'cancelled'}
                                    label={m.watchlist_cancelled()}
                                />
                                <MenuOption
                                    href={href({ type: 'hiatus' })}
                                    selected={data.selection.type === 'hiatus'}
                                    label={m.watchlist_hiatus()}
                                />
                            {/if}
                        </div>
                    {/snippet}
                </Dropdown>
                <Dropdown
                    id="watchlist-sort"
                    ariaLabel={m.watchlist_sorting()}
                    menuClass="mt-2 w-56 shadow-xl"
                    triggerClass="mb-2 flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted uppercase transition-colors hover:bg-surface hover:text-foreground data-[state=open]:bg-surface data-[state=open]:text-foreground"
                >
                    {#snippet trigger()}
                        <ListBulletsIcon size="1.2rem" weight="bold" aria-hidden="true" />
                        <span class="hidden sm:inline">
                            {#if data.selection.sort === 'updated'}
                                {m.watchlist_updated()}
                            {:else if data.selection.sort === 'added'}
                                {m.watchlist_added()}
                            {:else}
                                {m.watchlist_alphabetical()}
                            {/if}
                        </span>
                    {/snippet}

                    {#snippet content()}
                        <div role="menu" aria-label={m.watchlist_sorting()} class="py-2">
                            <div role="group" aria-label={m.watchlist_sorting()}>
                                <MenuOption
                                    href={href({ sort: 'updated' })}
                                    selected={data.selection.sort === 'updated'}
                                    label={m.watchlist_updated()}
                                />
                                <MenuOption
                                    href={href({ sort: 'added' })}
                                    selected={data.selection.sort === 'added'}
                                    label={m.watchlist_added()}
                                />
                                <MenuOption
                                    href={href({ sort: 'alphabetical' })}
                                    selected={data.selection.sort === 'alphabetical'}
                                    label={m.watchlist_alphabetical()}
                                />
                            </div>

                            <div role="group" aria-label={m.watchlist_sort_order()}>
                                <p class="px-5 pt-5 pb-2 text-xs font-bold text-foreground uppercase">
                                    {m.watchlist_sort_order()}
                                </p>
                                <MenuOption
                                    href={href({ order: 'newest' })}
                                    selected={data.selection.order === 'newest'}
                                    label={m.watchlist_newest()}
                                />
                                <MenuOption
                                    href={href({ order: 'oldest' })}
                                    selected={data.selection.order === 'oldest'}
                                    label={m.watchlist_oldest()}
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
                {#if data.entries.length === 0}
                    {@const body =
                        data.selection.state === 'watching'
                            ? m.watchlist_empty_watching()
                            : data.selection.state === 'plan_to_watch'
                              ? m.watchlist_empty_plan()
                              : data.selection.state === 'completed'
                                ? m.watchlist_empty_completed()
                                : data.selection.state === 'dropped'
                                  ? m.watchlist_empty_dropped()
                                  : m.watchlist_filtered_empty()}
                    <EmptyState
                        artwork={filteredEmptyArtwork}
                        artworkWidth={622}
                        artworkHeight={640}
                        id="empty-filter-message"
                        body={body}
                    >
                        {#snippet action()}
                            <a
                                href={href({ state: 'all' })}
                                class="inline-flex min-h-11 items-center bg-accent px-5 text-xs font-bold text-on-accent uppercase transition-[filter,transform] duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97]"
                            >
                                {m.watchlist_view_all()}
                            </a>
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
