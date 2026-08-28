<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { CaretDownIcon, CaretLeftIcon, CaretRightIcon, ListBulletsIcon } from 'phosphor-svelte';

    import type { FranchiseOrder as FranchiseOrderData } from '@arc/shared/types';
    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import { matchesFranchiseFilter, type FranchiseFilter } from '$lib/franchise';
    import Dropdown from '$lib/components/ui/Dropdown.svelte';
    import { m } from '$lib/paraglide/messages.js';

    interface Props {
        order: FranchiseOrderData;
        currentAnimeId: number;
    }

    let { order, currentAnimeId }: Props = $props();

    let track = $state<HTMLDivElement>();
    let canScrollBack = $state(false);
    let canScrollForward = $state(false);
    let filter = $state<FranchiseFilter>('main');
    const filters: Array<{ value: FranchiseFilter; label: string }> = [
        { value: 'main', label: m.franchise_main() },
        { value: 'movies', label: m.franchise_movies() },
        { value: 'side-stories', label: m.franchise_side() },
    ];
    const selectedFilterLabel = $derived(
        filters.find(({ value }) => value === filter)?.label ?? m.franchise_main()
    );
    const visibleEntries = $derived(
        order.entries.filter((entry) => matchesFranchiseFilter(entry, filter, currentAnimeId))
    );

    function updateScrollState() {
        if (!track) {
            return;
        }

        const maxScroll = track.scrollWidth - track.clientWidth;
        canScrollBack = track.scrollLeft > 1;
        canScrollForward = track.scrollLeft < maxScroll - 1;
    }

    function scrollByPage(direction: -1 | 1) {
        if (!track) {
            return;
        }

        track.scrollBy({
            left: direction * track.clientWidth,
            behavior: 'smooth',
        });
    }

    $effect(() => {
        if (!visibleEntries.length) {
            canScrollBack = false;
            canScrollForward = false;
            return;
        }

        void tick().then(() => {
            if (track) {
                track.scrollLeft = 0;
            }
            updateScrollState();
        });
    });

    onMount(() => {
        if (!track) {
            return;
        }

        const observer = new ResizeObserver(updateScrollState);
        observer.observe(track);
        updateScrollState();

        return () => observer.disconnect();
    });
</script>

<section class="pb-7" aria-labelledby="franchise-order-title">
    <div class="mb-6 flex min-h-9 items-center justify-between gap-4 px-2">
        <h2 id="franchise-order-title" class="text-lg font-semibold">{m.franchise_order()}</h2>

        <Dropdown
            id="franchise-order-filter"
            ariaLabel={`${m.franchise_filters()}: ${selectedFilterLabel}`}
            menuClass="mt-2 w-48 shadow-xl"
            triggerClass="flex min-h-9 cursor-pointer items-center gap-2 px-2 text-xs font-semibold text-muted uppercase transition-colors hover:bg-surface hover:text-foreground data-[state=open]:bg-surface data-[state=open]:text-foreground"
        >
            {#snippet trigger()}
                <ListBulletsIcon size="1rem" weight="bold" aria-hidden="true" />
                <span>{selectedFilterLabel}</span>
                <CaretDownIcon size="0.8rem" weight="bold" aria-hidden="true" />
            {/snippet}

            {#snippet content()}
                <div role="menu" aria-label={m.franchise_filters()} class="py-2">
                    {#each filters as option}
                        <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={filter === option.value}
                            class:text-foreground={filter === option.value}
                            class="flex min-h-11 w-full items-center px-5 text-left text-sm text-muted transition-colors hover:bg-panel-hover hover:text-foreground focus:bg-panel-hover focus:text-foreground focus:outline-none"
                            onclick={() => (filter = option.value)}
                        >
                            {option.label}
                        </button>
                    {/each}
                </div>
            {/snippet}
        </Dropdown>
    </div>

    {#if visibleEntries.length}
        <div class="relative">
            <div
                id="franchise-order-list"
                bind:this={track}
                class="grid snap-x snap-mandatory auto-cols-franchise grid-flow-col gap-x-2 gap-y-8 overflow-x-auto overflow-y-hidden px-2 overscroll-x-contain scroll-smooth sm:gap-x-3 md:auto-cols-franchise-md md:gap-x-[1.875rem] 2xl:auto-cols-franchise-2xl"
                onscroll={updateScrollState}
            >
                {#each visibleEntries as entry}
                    <div class="min-w-0 snap-start">
                        <AnimeCard anime={entry} current={entry.anilistId === currentAnimeId} />
                    </div>
                {/each}
            </div>

            {#if canScrollBack}
                <button
                    type="button"
                    class="absolute inset-y-0 left-0 z-20 my-auto hidden size-10 place-items-center text-white drop-shadow-lg focus-visible:ring-1 focus-visible:ring-white focus-visible:outline-none md:grid"
                    aria-label={m.shared_franchise_previous()}
                    onclick={() => scrollByPage(-1)}
                >
                    <CaretLeftIcon size="1.75rem" weight="bold" aria-hidden="true" />
                </button>
            {/if}

            {#if canScrollForward}
                <button
                    type="button"
                    class="absolute inset-y-0 right-0 z-20 my-auto hidden size-10 place-items-center text-white drop-shadow-lg focus-visible:ring-1 focus-visible:ring-white focus-visible:outline-none md:grid"
                    aria-label={m.shared_franchise_next()}
                    onclick={() => scrollByPage(1)}
                >
                    <CaretRightIcon size="1.75rem" weight="bold" aria-hidden="true" />
                </button>
            {/if}
        </div>
    {:else}
        <p class="px-2 text-sm text-muted">{m.franchise_empty()}</p>
    {/if}
</section>
