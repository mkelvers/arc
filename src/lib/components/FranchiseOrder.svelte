<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { CaretLeftIcon, CaretRightIcon } from 'phosphor-svelte';

    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import type { FranchiseOrder as FranchiseOrderData } from '$lib/server/anime/franchise';

    interface Props {
        order: FranchiseOrderData;
        currentAnimeId: number;
    }

    let { order, currentAnimeId }: Props = $props();

    let track = $state<HTMLDivElement>();
    let canScrollBack = $state(false);
    let canScrollForward = $state(false);
    const visibleEntries = $derived(order.entries);

    function updateScrollState() {
        if (!track) return;

        const maxScroll = track.scrollWidth - track.clientWidth;
        canScrollBack = track.scrollLeft > 1;
        canScrollForward = track.scrollLeft < maxScroll - 1;
    }

    function scrollByPage(direction: -1 | 1) {
        if (!track) return;

        track.scrollBy({
            left: direction * track.clientWidth,
            behavior: 'smooth',
        });
    }

    $effect(() => {
        visibleEntries.length;
        void tick().then(() => {
            if (track) track.scrollLeft = 0;
            updateScrollState();
        });
    });

    onMount(() => {
        if (!track) return;

        const observer = new ResizeObserver(updateScrollState);
        observer.observe(track);
        updateScrollState();

        return () => observer.disconnect();
    });
</script>

<section class="pb-7" aria-labelledby="franchise-order-title">
    <h2 id="franchise-order-title" class="mb-6 text-lg font-semibold">
        Franchise Order
    </h2>

    {#if visibleEntries.length}
        <div class="relative">
            <div
                bind:this={track}
                class="-mx-2 grid auto-cols-franchise grid-flow-col gap-x-5 gap-y-8 overflow-x-auto scroll-smooth md:auto-cols-franchise-md 2xl:auto-cols-franchise-2xl"
                onscroll={updateScrollState}
            >
                {#each visibleEntries as entry}
                    <AnimeCard
                        anime={entry}
                        current={entry.anilistId === currentAnimeId}
                        watchlisted={entry.watchlisted}
                    />
                {/each}
            </div>

            <div
                class="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-linear-to-r from-canvas via-canvas/70 to-transparent opacity-0 transition-opacity md:w-28"
                class:opacity-100={canScrollBack}
                aria-hidden="true"
            ></div>
            <div
                class="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-linear-to-l from-canvas via-canvas/70 to-transparent opacity-0 transition-opacity md:w-28"
                class:opacity-100={canScrollForward}
                aria-hidden="true"
            ></div>

            {#if canScrollBack}
                <button
                    type="button"
                    class="absolute top-1/2 left-5 z-20 grid size-10 -translate-y-1/2 place-items-center text-white drop-shadow-lg focus-visible:ring-1 focus-visible:ring-white focus-visible:outline-none md:left-10 2xl:left-12"
                    aria-label="Previous franchise titles"
                    onclick={() => scrollByPage(-1)}
                >
                    <CaretLeftIcon size="1.75rem" weight="bold" aria-hidden="true" />
                </button>
            {/if}

            {#if canScrollForward}
                <button
                    type="button"
                    class="absolute top-1/2 right-5 z-20 grid size-10 -translate-y-1/2 place-items-center text-white drop-shadow-lg focus-visible:ring-1 focus-visible:ring-white focus-visible:outline-none md:right-10 2xl:right-12"
                    aria-label="Next franchise titles"
                    onclick={() => scrollByPage(1)}
                >
                    <CaretRightIcon size="1.75rem" weight="bold" aria-hidden="true" />
                </button>
            {/if}
        </div>
    {:else}
        <p class="text-sm text-muted">No titles match the selected formats.</p>
    {/if}
</section>
