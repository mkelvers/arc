<script lang="ts">
    import { onDestroy, untrack } from 'svelte';
    import { CircleIcon, CircleNotchIcon, FunnelIcon, ListBulletsIcon, RadioButtonIcon } from 'phosphor-svelte';

    import { browseSearchParams, type BrowseFilters } from '@arc/shared/browse';
    import type { AnimeCard as AnimeCardModel } from '@arc/shared/types';
    import emptyArtwork from '$lib/assets/browse-empty.png';
    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import EmptyState from '$lib/components/ui/EmptyState.svelte';
    import { m } from '$lib/i18n.svelte';
    import {
        appendCatalogPage,
        createPaginationGate,
        fetchCatalogPage,
        type PaginationStrategy,
    } from './catalog-pagination';

    interface Props {
        kind: 'new' | 'popular';
        initialAnime: AnimeCardModel[];
        initialHasNextPage: boolean;
        initialPage: number;
        loadedAt: string;
        filters: BrowseFilters;
        paginationStrategy: PaginationStrategy;
    }

    let { kind, initialAnime, initialHasNextPage, initialPage, loadedAt, filters, paginationStrategy }: Props =
        $props();
    let anime = $state<AnimeCardModel[]>(untrack(() => initialAnime));
    let nextPage = $state<number | null>(untrack(() => (initialHasNextPage ? initialPage + 1 : null)));
    let loading = $state(false);
    let loadError = $state(false);
    let sentinel = $state<HTMLDivElement>();
    let activeRequest: AbortController | undefined;
    let loadedListing = untrack(
        () => `${kind}:${initialPage}:${initialHasNextPage}:${loadedAt}:${browseSearchParams(filters)}`
    );
    const paginationGate = createPaginationGate(untrack(() => paginationStrategy));
    const loadedAtMs = $derived(new Date(loadedAt).getTime());
    const sections = $derived.by(() => {
        if (kind === 'popular') {
            return [
                {
                    title: m.catalog_popular(),
                    anime,
                },
            ];
        }

        const groups = [
            { title: m.catalog_last_day(), anime: [] as AnimeCardModel[] },
            { title: m.catalog_past_week(), anime: [] as AnimeCardModel[] },
            { title: m.catalog_earlier(), anime: [] as AnimeCardModel[] },
        ];
        for (const entry of anime) {
            const age = Math.max(0, loadedAtMs - new Date(entry.releasedAt ?? loadedAt).getTime());
            groups[age < 24 * 60 * 60 * 1_000 ? 0 : age < 7 * 24 * 60 * 60 * 1_000 ? 1 : 2]!.anime.push(entry);
        }
        return groups.filter((group) => group.anime.length);
    });
    const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
    const selectedSort = $derived(kind === 'new' ? 'newest' : 'popularity');
    const selectedSortLabel = $derived(selectedSort === 'newest' ? m.catalog_newest() : m.catalog_popularity());
    const selectedFilterCount = $derived(Number(filters.audio !== null) + Number(filters.format !== null));
    const filterGroups = [
        {
            label: 'Language',
            key: 'audio',
            options: [
                { label: 'All', value: null },
                { label: 'Subtitled', value: 'sub' },
                { label: 'Dubbed', value: 'dub' },
            ],
        },
        {
            label: 'Media',
            key: 'format',
            options: [
                { label: 'All', value: null },
                { label: 'Series', value: 'TV' },
                { label: 'Movies', value: 'MOVIE' },
            ],
        },
    ] as const;

    function catalogHref(path: '/shows/new' | '/shows/popular', patch: Partial<BrowseFilters> = {}) {
        const query = browseSearchParams({ ...filters, ...patch }).toString();
        return query ? `${path}?${query}` : path;
    }

    function filterHref(key: 'audio' | 'format', value: string | null) {
        return catalogHref(kind === 'new' ? '/shows/new' : '/shows/popular', { [key]: value });
    }

    function releasedLabel(releasedAt: string | undefined) {
        const ageMs = Math.max(0, loadedAtMs - new Date(releasedAt ?? loadedAt).getTime());
        const minutes = Math.floor(ageMs / 60_000);
        if (minutes < 60) {
            return relativeTime.format(-Math.max(1, minutes), 'minute');
        }
        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return relativeTime.format(-hours, 'hour');
        }
        return relativeTime.format(-Math.floor(hours / 24), 'day');
    }

    async function loadMore() {
        const page = nextPage;
        if (page === null || loadError) {
            return;
        }
        if (!paginationGate.observe(true)) {
            return;
        }

        const controller = new AbortController();
        activeRequest = controller;
        loading = true;
        loadError = false;

        try {
            const result = await fetchCatalogPage({
                kind,
                filters,
                page,
                signal: controller.signal,
                retryOnce: paginationStrategy === 'gated',
            });
            const update = appendCatalogPage(anime, page, result);
            anime = update.anime;
            nextPage = update.nextPage;
        } catch (cause) {
            if (!(cause instanceof DOMException) || cause.name !== 'AbortError') {
                console.warn(`${kind} page ${page} could not be loaded`, cause);
                loadError = paginationStrategy === 'gated';
            }
        } finally {
            if (activeRequest === controller) {
                activeRequest = undefined;
                loading = false;
                paginationGate.complete();
            }
        }
    }

    $effect(() => {
        const listing = `${kind}:${initialPage}:${initialHasNextPage}:${loadedAt}:${browseSearchParams(filters)}`;
        if (listing === loadedListing) {
            return;
        }

        activeRequest?.abort();
        loadedListing = listing;
        paginationGate.reset();
        anime = initialAnime;
        nextPage = initialHasNextPage ? initialPage + 1 : null;
        loading = false;
        loadError = false;
    });

    $effect(() => {
        if (!sentinel || nextPage === null) {
            return;
        }
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) {
                    void loadMore();
                } else {
                    paginationGate.observe(false);
                }
            },
            { rootMargin: '600px 0px' }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    });

    onDestroy(() => activeRequest?.abort());
</script>

<main class="min-h-dvh bg-canvas px-5 py-10 text-foreground sm:px-10 sm:py-12 lg:px-16 lg:py-16">
    <section class="mx-auto w-full max-w-264" aria-labelledby="catalog-title">
        <div class="mb-8 flex items-center justify-between gap-4">
            <h1 id="catalog-title" class="text-xl font-bold sm:text-2xl">
                {kind === 'new' ? m.catalog_newly_added() : m.catalog_most_popular()}
            </h1>
            <div class="flex items-center">
                <Dropdown
                    id="catalog-sort"
                    ariaLabel={`Sort anime. ${selectedSortLabel} selected`}
                    menuClass="mt-2 w-52 shadow-xl"
                    triggerClass="flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted uppercase transition-colors hover:bg-surface hover:text-foreground data-[state=open]:bg-surface data-[state=open]:text-foreground"
                >
                    {#snippet trigger()}
                        <ListBulletsIcon size="1.2rem" weight="bold" aria-hidden="true" />
                        <span class="hidden sm:inline">{selectedSortLabel}</span>
                    {/snippet}
                    {#snippet content()}
                        <div role="menu" aria-label="Catalog sorting" class="py-2">
                            {#each [{ label: m.catalog_popularity(), value: 'popularity', href: catalogHref( '/shows/popular', { sort: 'popularity', order: 'desc' } ) }, { label: m.catalog_newest(), value: 'newest', href: catalogHref( '/shows/new', { sort: 'popularity', order: 'desc' } ) }] as const as option}
                                <a
                                    role="menuitem"
                                    aria-current={selectedSort === option.value ? 'page' : undefined}
                                    href={option.href}
                                    class:text-foreground={selectedSort === option.value}
                                    class="block min-h-11 px-5 py-3 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                >
                                    {option.label}
                                </a>
                            {/each}
                        </div>
                    {/snippet}
                </Dropdown>

                <Dropdown
                    id="catalog-filter"
                    ariaLabel={`Filter anime${selectedFilterCount ? `, ${selectedFilterCount} selected` : ''}`}
                    menuClass="mt-2 w-60 shadow-xl"
                    triggerClass="ml-1 flex h-10 shrink-0 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted uppercase transition-colors hover:bg-surface hover:text-foreground data-[state=open]:bg-surface data-[state=open]:text-foreground"
                >
                    {#snippet trigger()}
                        <FunnelIcon size="1.2rem" weight="bold" aria-hidden="true" />
                        <span class="hidden sm:inline">Filter</span>
                        {#if selectedFilterCount}
                            <span class="text-accent">{selectedFilterCount}</span>
                        {/if}
                    {/snippet}
                    {#snippet content()}
                        <div role="menu" aria-label="Catalog filtering" class="py-2">
                            {#each filterGroups as group}
                                <p class="px-5 pt-3 pb-2 text-base font-bold text-foreground">
                                    {group.label}
                                </p>
                                {#each group.options as option}
                                    <a
                                        role="menuitemradio"
                                        aria-checked={filters[group.key] === option.value}
                                        href={filterHref(group.key, option.value)}
                                        class:text-foreground={filters[group.key] === option.value}
                                        class="flex min-h-11 items-center gap-2.5 px-5 text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                    >
                                        {#if filters[group.key] === option.value}
                                            <RadioButtonIcon
                                                size="1.25rem"
                                                weight="fill"
                                                class="text-accent"
                                                aria-hidden="true"
                                            />
                                        {:else}
                                            <CircleIcon size="1.25rem" aria-hidden="true" />
                                        {/if}
                                        {option.label}
                                    </a>
                                {/each}
                            {/each}
                        </div>
                    {/snippet}
                </Dropdown>
            </div>
        </div>

        {#each sections as section (section.title)}
            <section class="mb-12" aria-labelledby={`section-${section.title.replaceAll(' ', '-').toLowerCase()}`}>
                <h2
                    id={`section-${section.title.replaceAll(' ', '-').toLowerCase()}`}
                    class="mb-4 text-base font-bold"
                >
                    {section.title}
                </h2>
                <div
                    class="grid grid-cols-2 items-start gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-[1.875rem] lg:gap-y-12 xl:grid-cols-6"
                >
                    {#each section.anime as entry (entry.id)}
                        <AnimeCard
                            anime={entry}
                            meta={kind === 'new'
                                ? `${entry.episode ? `E${entry.episode} · ` : ''}${releasedLabel(entry.releasedAt)}`
                                : undefined}
                            reserveTitleSpace={false}
                            truncateTitle={false}
                        />
                    {/each}
                </div>
            </section>
        {/each}

        {#if !anime.length}
            <EmptyState
                artwork={emptyArtwork}
                artworkWidth={1254}
                artworkHeight={1254}
                id="empty-catalog-message"
                body={m.catalog_empty()}
            />
        {/if}

        {#if nextPage !== null}
            <div bind:this={sentinel} class="flex min-h-24 w-full items-center justify-center" aria-live="polite">
                {#if loading}
                    <CircleNotchIcon
                        size="2rem"
                        weight="bold"
                        class="animate-spin text-accent motion-reduce:animate-none"
                        aria-label={m.catalog_loading()}
                    />
                {:else}
                    <span class="sr-only">{m.catalog_auto_loading()}</span>
                {/if}
            </div>
        {/if}
    </section>
</main>
