<script lang="ts">
    import { afterNavigate, goto } from '$app/navigation';
    import { onDestroy, untrack } from 'svelte';
    import {
        BookOpenTextIcon,
        CalendarBlankIcon,
        CaretDownIcon,
        ChartBarIcon,
        CircleNotchIcon,
        GlobeHemisphereWestIcon,
        MagnifyingGlassIcon,
        MicrophoneStageIcon,
        MonitorPlayIcon,
        PulseIcon,
        ShieldCheckIcon,
        SortAscendingIcon,
        SortDescendingIcon,
        SunHorizonIcon,
        TagIcon,
    } from 'phosphor-svelte';

    import { animeFormatLabel, browseSearchParams, metadataLabel, type BrowseFilters } from '@arc/shared/browse';
    import { AnimeCardPageSchema, type AnimeCard as AnimeCardModel } from '@arc/shared/types';
    import { cn } from '$lib/utils';
    import emptyArtwork from '$lib/assets/browse-empty.png';
    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import EmptyState from '$lib/components/ui/EmptyState.svelte';
    import { m } from '$lib/paraglide/messages.js';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    let query = $state(untrack(() => data.filters.query));
    let loadedSelection = untrack(() => browseSearchParams(data.filters).toString());
    let anime = $state<AnimeCardModel[]>(untrack(() => data.anime));
    let nextPage = $state<number | null>(untrack(() => (data.hasNextPage ? data.page + 1 : null)));
    let loading = $state(false);
    let sentinel = $state<HTMLDivElement>();
    let activeRequest: AbortController | undefined;
    let categoryQuery = $state('');
    let safe = $state(untrack(() => data.filters.safe));
    const categoryNeedle = $derived(categoryQuery.trim().toLocaleLowerCase('en'));
    const visibleGenres = $derived(
        data.taxonomy.genres.filter((value) => value.toLocaleLowerCase('en').includes(categoryNeedle))
    );
    const visibleTags = $derived(
        data.taxonomy.tags.filter((value) => value.toLocaleLowerCase('en').includes(categoryNeedle))
    );
    const browseOrderings = [
        { label: m.browse_most_popular(), sort: 'popularity', order: 'desc' },
        { label: m.browse_least_popular(), sort: 'popularity', order: 'asc' },
        { label: m.browse_highest_score(), sort: 'score', order: 'desc' },
        { label: m.browse_lowest_score(), sort: 'score', order: 'asc' },
    ] as const;
    const ordering = $derived(
        browseOrderings.find(
            (option) => option.sort === data.filters.sort && option.order === data.filters.order
        ) ?? browseOrderings[0]
    );
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    const countryLabel = (value: string) => regionNames.of(value) ?? value;

    function filterHref(patch: Partial<BrowseFilters>) {
        const search = browseSearchParams({
            ...data.filters,
            query: query.trim(),
            ...patch,
        }).toString();

        return search ? `/browse?${search}` : '/browse';
    }

    function filterItems(
        key: 'genre' | 'status' | 'format' | 'source' | 'season' | 'country',
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

    async function toggleSafe() {
        const next = !safe;
        safe = next;

        try {
            await goto(filterHref({ safe: next }), {
                keepFocus: true,
                noScroll: true,
            });
        } catch (cause) {
            safe = data.filters.safe;
            console.warn('Safe mode could not be updated', cause);
        }
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
            const response = await fetch(`/v1/browse?${searchParams}`, {
                headers: {
                    Accept: 'application/json',
                },
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`Browse page request returned ${response.status}`);
            }

            const result = AnimeCardPageSchema.safeParse(await response.json());
            if (!result.success || result.data.page !== page) {
                throw new TypeError('Browse page request returned an invalid response');
            }
            if (loadedSelection !== requestSelection) {
                return;
            }

            const existing = new Set(anime.map(({ id }) => id));
            anime = [...anime, ...result.data.anime.filter(({ id }) => !existing.has(id))];
            hasNextPage = result.data.hasNextPage;
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
        safe = data.filters.safe;
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
        if (!sentinel || nextPage === null) {
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
        observer.observe(sentinel);

        return () => observer.disconnect();
    });

    onDestroy(() => activeRequest?.abort());
</script>

<svelte:head>
    <title>Arc — {m.browse_title()}</title>
    <meta
        name="description"
        content="Browse anime by genre, tag, status, type, audio, season, year, source material, country, popularity, and score."
    />
</svelte:head>

<main class="min-h-dvh bg-canvas px-5 py-10 text-foreground sm:px-10 sm:py-12 lg:px-16 lg:py-16">
    <section class="mx-auto w-full max-w-264" aria-labelledby="browse-title">
        <h1 id="browse-title" class="mb-6 text-2xl font-bold">{m.browse_title()}</h1>

        <div class="mb-10">
            <label
                class="flex h-14 w-full items-center gap-4 border-b-2 border-border text-muted transition-colors focus-within:border-accent focus-within:text-foreground"
            >
                <MagnifyingGlassIcon size="1.35rem" weight="regular" class="shrink-0" aria-hidden="true" />
                <span class="sr-only">{m.search_anime()}</span>
                <input
                    name="q"
                    type="search"
                    placeholder={m.browse_placeholder()}
                    autocomplete="off"
                    maxlength="200"
                    bind:value={query}
                    class="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-subtle"
                />
            </label>

            <div class="mt-3 flex flex-wrap items-center gap-1 sm:gap-2">
                <Dropdown
                    id="browse-genre"
                    ariaLabel={m.browse_filter_genre_tag()}
                    menuAlign="start"
                    menuClass="mt-2 max-h-80 min-w-52 overflow-y-auto shadow-xl"
                    triggerClass={cn(
                        'flex h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium transition-colors hover:bg-surface hover:text-foreground peer-checked:bg-surface peer-checked:text-foreground',
                        data.filters.genre || data.filters.tag ? 'text-accent' : 'text-muted'
                    )}
                >
                    {#snippet trigger()}
                        <TagIcon size="1.1rem" weight="regular" aria-hidden="true" />
                        <span class="max-w-32 truncate">
                            {data.filters.genre ?? data.filters.tag ?? m.browse_genres_tags()}
                        </span>
                        <CaretDownIcon size="0.8rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                    {#snippet content()}
                        <div role="menu" aria-label={m.browse_filter_genre_tag()}>
                            <div class="sticky top-0 z-10 border-b border-border bg-panel p-2">
                                <label
                                    class="flex h-9 items-center gap-2 px-2 text-muted focus-within:text-foreground"
                                >
                                    <MagnifyingGlassIcon size="1rem" weight="regular" aria-hidden="true" />
                                    <span class="sr-only">{m.browse_search_genres_tags()}</span>
                                    <input
                                        type="search"
                                        placeholder={m.browse_find_genre_tag()}
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
                                class:text-muted={data.filters.genre !== null || data.filters.tag !== null}
                                class="block whitespace-nowrap px-5 py-3 text-sm leading-tight hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            >
                                {m.browse_all_genres_tags()}
                            </a>
                            {#if visibleGenres.length}
                                <p
                                    class="border-t border-border px-5 pt-3 pb-1 text-xs font-medium tracking-wide text-subtle uppercase"
                                >
                                    {m.browse_genres()}
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
                                    {m.browse_tags()}
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
                                <p class="px-5 py-5 text-sm text-muted">{m.browse_no_matching()}</p>
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
                        m.browse_all_statuses(),
                        metadataLabel
                    )}
                    ariaLabel={m.browse_filter_status()}
                    menuClass="mt-2 max-h-80 min-w-52 overflow-y-auto shadow-xl"
                    triggerClass={cn(
                        'flex h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium transition-colors hover:bg-surface hover:text-foreground peer-checked:bg-surface peer-checked:text-foreground',
                        data.filters.status ? 'text-accent' : 'text-muted'
                    )}
                >
                    {#snippet trigger()}
                        <PulseIcon size="1.1rem" weight="regular" aria-hidden="true" />
                        <span class="max-w-32 truncate">
                            {selectedLabel(data.filters.status, m.browse_status(), metadataLabel)}
                        </span>
                        <CaretDownIcon size="0.8rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                </Dropdown>

                <Dropdown
                    id="browse-format"
                    items={filterItems(
                        'format',
                        data.taxonomy.formats,
                        data.filters.format,
                        m.browse_all_types(),
                        animeFormatLabel
                    )}
                    ariaLabel={m.browse_filter_type()}
                    menuClass="mt-2 max-h-80 min-w-48 overflow-y-auto shadow-xl"
                    triggerClass={cn(
                        'flex h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium transition-colors hover:bg-surface hover:text-foreground peer-checked:bg-surface peer-checked:text-foreground',
                        data.filters.format ? 'text-accent' : 'text-muted'
                    )}
                >
                    {#snippet trigger()}
                        <MonitorPlayIcon size="1.1rem" weight="regular" aria-hidden="true" />
                        <span class="max-w-28 truncate">
                            {selectedLabel(data.filters.format, m.browse_type(), animeFormatLabel)}
                        </span>
                        <CaretDownIcon size="0.8rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                </Dropdown>

                <Dropdown
                    id="browse-audio"
                    items={[
                        {
                            label: m.browse_any_audio(),
                            href: filterHref({ audio: null }),
                            current: data.filters.audio === null,
                        },
                        {
                            label: m.watchlist_dubbed(),
                            href: filterHref({ audio: 'dub' }),
                            current: data.filters.audio === 'dub',
                        },
                    ]}
                    ariaLabel={m.browse_filter_audio()}
                    menuClass="mt-2 min-w-44 shadow-xl"
                    triggerClass={cn(
                        'flex h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium transition-colors hover:bg-surface hover:text-foreground peer-checked:bg-surface peer-checked:text-foreground',
                        data.filters.audio ? 'text-accent' : 'text-muted'
                    )}
                >
                    {#snippet trigger()}
                        <MicrophoneStageIcon size="1.1rem" weight="regular" aria-hidden="true" />
                        <span>{data.filters.audio === 'dub' ? m.watchlist_dubbed() : m.browse_audio()}</span>
                        <CaretDownIcon size="0.8rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                </Dropdown>

                <Dropdown
                    id="browse-season"
                    items={filterItems(
                        'season',
                        data.taxonomy.seasons,
                        data.filters.season,
                        m.browse_all_seasons(),
                        metadataLabel
                    )}
                    ariaLabel={m.browse_filter_season()}
                    menuClass="mt-2 min-w-44 shadow-xl"
                    triggerClass={cn(
                        'flex h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium transition-colors hover:bg-surface hover:text-foreground peer-checked:bg-surface peer-checked:text-foreground',
                        data.filters.season ? 'text-accent' : 'text-muted'
                    )}
                >
                    {#snippet trigger()}
                        <SunHorizonIcon size="1.1rem" weight="regular" aria-hidden="true" />
                        <span>{selectedLabel(data.filters.season, m.browse_season(), metadataLabel)}</span>
                        <CaretDownIcon size="0.8rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                </Dropdown>

                <Dropdown
                    id="browse-year"
                    items={[
                        {
                            label: m.browse_all_years(),
                            href: filterHref({ year: null }),
                            current: data.filters.year === null,
                        },
                        ...data.taxonomy.years.map((year) => ({
                            label: String(year),
                            href: filterHref({ year }),
                            current: data.filters.year === year,
                        })),
                    ]}
                    ariaLabel={m.browse_filter_year()}
                    menuClass="mt-2 max-h-80 min-w-36 overflow-y-auto shadow-xl"
                    triggerClass={cn(
                        'flex h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium transition-colors hover:bg-surface hover:text-foreground peer-checked:bg-surface peer-checked:text-foreground',
                        data.filters.year ? 'text-accent' : 'text-muted'
                    )}
                >
                    {#snippet trigger()}
                        <CalendarBlankIcon size="1.1rem" weight="regular" aria-hidden="true" />
                        <span>{data.filters.year ?? m.browse_year()}</span>
                        <CaretDownIcon size="0.8rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                </Dropdown>

                <Dropdown
                    id="browse-source"
                    items={filterItems(
                        'source',
                        data.taxonomy.sources,
                        data.filters.source,
                        m.browse_all_sources(),
                        metadataLabel
                    )}
                    ariaLabel={m.browse_filter_source()}
                    menuClass="mt-2 max-h-80 min-w-56 overflow-y-auto shadow-xl"
                    triggerClass={cn(
                        'flex h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium transition-colors hover:bg-surface hover:text-foreground peer-checked:bg-surface peer-checked:text-foreground',
                        data.filters.source ? 'text-accent' : 'text-muted'
                    )}
                >
                    {#snippet trigger()}
                        <BookOpenTextIcon size="1.1rem" weight="regular" aria-hidden="true" />
                        <span class="max-w-36 truncate">
                            {selectedLabel(data.filters.source, m.browse_source(), metadataLabel)}
                        </span>
                        <CaretDownIcon size="0.8rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                </Dropdown>

                <Dropdown
                    id="browse-country"
                    items={filterItems(
                        'country',
                        data.taxonomy.countries,
                        data.filters.country,
                        m.browse_all_countries(),
                        countryLabel
                    )}
                    ariaLabel={m.browse_filter_country()}
                    menuClass="mt-2 max-h-80 min-w-48 overflow-y-auto shadow-xl"
                    triggerClass={cn(
                        'flex h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium transition-colors hover:bg-surface hover:text-foreground peer-checked:bg-surface peer-checked:text-foreground',
                        data.filters.country ? 'text-accent' : 'text-muted'
                    )}
                >
                    {#snippet trigger()}
                        <GlobeHemisphereWestIcon size="1.1rem" weight="regular" aria-hidden="true" />
                        <span class="max-w-32 truncate">
                            {selectedLabel(data.filters.country, m.browse_country(), countryLabel)}
                        </span>
                        <CaretDownIcon size="0.8rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                </Dropdown>
                <div class="h-px basis-full bg-border"></div>
                <span class="grow" aria-hidden="true"></span>
                <Dropdown
                    id="browse-sort"
                    ariaLabel={m.browse_ordering({ label: ordering.label })}
                    menuClass="mt-2 min-w-48 shadow-xl"
                    triggerClass="flex h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground peer-checked:bg-surface peer-checked:text-foreground"
                >
                    {#snippet trigger()}
                        <ChartBarIcon size="1.1rem" weight="regular" aria-hidden="true" />
                        <span>{ordering.label}</span>
                        {#if data.filters.order === 'desc'}
                            <SortDescendingIcon size="1.1rem" weight="regular" aria-hidden="true" />
                        {:else}
                            <SortAscendingIcon size="1.1rem" weight="regular" aria-hidden="true" />
                        {/if}
                        <CaretDownIcon size="0.8rem" weight="bold" aria-hidden="true" />
                    {/snippet}
                    {#snippet content()}
                        <div role="menu" aria-label={m.browse_ordering_menu()}>
                            {#each browseOrderings as option}
                                <a
                                    role="menuitem"
                                    href={filterHref({ sort: option.sort, order: option.order })}
                                    aria-current={ordering === option ? 'page' : undefined}
                                    class:text-accent={ordering === option}
                                    class:text-muted={ordering !== option}
                                    class="block whitespace-nowrap px-5 py-3 text-sm leading-tight hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                                >
                                    {option.label}
                                </a>
                            {/each}
                        </div>
                    {/snippet}
                </Dropdown>

                <button
                    type="button"
                    class:text-accent={safe}
                    class:text-muted={!safe}
                    class="inline-flex h-11 items-center gap-2 px-3 text-sm font-medium transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent"
                    aria-label={safe ? m.browse_safe_on() : m.browse_safe_off()}
                    aria-pressed={safe}
                    onclick={() => void toggleSafe()}
                >
                    <ShieldCheckIcon size="1.25rem" weight={safe ? 'fill' : 'regular'} aria-hidden="true" />
                    <span>{m.browse_safe_mode()}</span>
                </button>
            </div>
        </div>

        {#if anime.length}
            <div
                class="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-[1.875rem] lg:gap-y-12 xl:grid-cols-6"
            >
                {#each anime as entry (entry.id)}
                    <AnimeCard anime={entry} />
                {/each}
            </div>
        {:else}
            <EmptyState
                artwork={emptyArtwork}
                artworkWidth={1254}
                artworkHeight={1254}
                id="empty-browse-message"
                body={m.browse_empty()}
                actionHref="/browse"
                actionLabel={m.browse_clear_filters()}
            />
        {/if}

        {#if nextPage !== null}
            <div bind:this={sentinel} class="flex min-h-24 w-full items-center justify-center" aria-live="polite">
                {#if loading}
                    <CircleNotchIcon
                        size="2rem"
                        weight="bold"
                        class="animate-spin text-accent motion-reduce:animate-none"
                        aria-label={m.browse_loading()}
                    />
                {:else}
                    <span class="sr-only">{m.browse_auto_loading()}</span>
                {/if}
            </div>
        {/if}
    </section>
</main>
