<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { CaretLeftIcon, CaretRightIcon } from 'phosphor-svelte';

    import type { FranchiseOrder as FranchiseOrderData } from '$lib/types';
    import AnimeCard from '$lib/components/AnimeCard.svelte';

    interface Props {
        order: FranchiseOrderData;
        currentAnimeId: number;
    }

    let { order, currentAnimeId }: Props = $props();

    let track = $state<HTMLDivElement>();
    let canScrollBack = $state(false);
    let canScrollForward = $state(false);
    let showAll = $state(false);
    const mainEntries = $derived(
        order.entries.filter((entry) => entry.primary || entry.anilistId === currentAnimeId)
    );
    const hiddenCount = $derived(order.entries.length - mainEntries.length);
    const visibleEntries = $derived(showAll ? order.entries : mainEntries);

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
    <div class="mb-6 flex min-h-9 items-center justify-between gap-4">
        <h2 id="franchise-order-title" class="text-lg font-semibold">Franchise Order</h2>

        {#if hiddenCount}
            <button
                type="button"
                class="min-h-9 shrink-0 text-xs font-semibold text-accent uppercase focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-expanded={showAll}
                aria-controls="franchise-order-list"
                onclick={() => (showAll = !showAll)}
            >
                {showAll ? 'Show main' : `Show all (+${hiddenCount})`}
            </button>
        {/if}
    </div>

    {#if visibleEntries.length}
        <div class="relative">
            <div
                id="franchise-order-list"
                bind:this={track}
                class="grid snap-x snap-mandatory auto-cols-franchise grid-flow-col gap-x-2 gap-y-8 overflow-x-auto overscroll-x-contain scroll-smooth sm:gap-x-3 md:auto-cols-franchise-md md:gap-x-5 2xl:auto-cols-franchise-2xl"
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
                    class="absolute inset-y-0 left-10 z-20 my-auto hidden size-10 place-items-center text-white drop-shadow-lg focus-visible:ring-1 focus-visible:ring-white focus-visible:outline-none md:grid 2xl:left-12"
                    aria-label="Previous franchise titles"
                    onclick={() => scrollByPage(-1)}
                >
                    <CaretLeftIcon size="1.75rem" weight="bold" aria-hidden="true" />
                </button>
            {/if}

            {#if canScrollForward}
                <button
                    type="button"
                    class="absolute inset-y-0 right-10 z-20 my-auto hidden size-10 place-items-center text-white drop-shadow-lg focus-visible:ring-1 focus-visible:ring-white focus-visible:outline-none md:grid 2xl:right-12"
                    aria-label="Next franchise titles"
                    onclick={() => scrollByPage(1)}
                >
                    <CaretRightIcon size="1.75rem" weight="bold" aria-hidden="true" />
                </button>
            {/if}
        </div>
    {:else}
        <p class="text-sm text-muted">No franchise titles found.</p>
    {/if}
</section>
