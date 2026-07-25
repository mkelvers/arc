<script lang="ts">
    import { onMount, tick, untrack } from 'svelte';
    import {
        CaretDownIcon,
        CaretLeftIcon,
        CaretRightIcon,
        CheckIcon,
    } from 'phosphor-svelte';

    import Dropdown from '$lib/components/Dropdown.svelte';
    import type { FranchiseOrder as FranchiseOrderData } from '$lib/server/anime/franchise';

    interface Props {
        order: FranchiseOrderData;
        currentAnimeId: number;
    }

    let { order, currentAnimeId }: Props = $props();

    let track = $state<HTMLDivElement>();
    let canScrollBack = $state(false);
    let canScrollForward = $state(false);
    let selectedTypes = $state(
        untrack(() => {
            const preferredTypes = order.types
                .filter(({ label }) => label === 'TV' || label === 'Movie')
                .map(({ label }) => label);

            return preferredTypes.length
                ? preferredTypes
                : order.types.map(({ label }) => label);
        }),
    );
    const visibleEntries = $derived(
        order.entries.filter(
            ({ secondary, type }) =>
                selectedTypes.includes(type) &&
                (!secondary || (type !== 'TV' && type !== 'Movie')),
        ),
    );
    const selectedLabel = $derived.by(() => {
        const selected = order.types
            .map(({ label }) => label)
            .filter((label) => selectedTypes.includes(label));

        if (
            selected.length === 2 &&
            selected.includes('TV') &&
            selected.includes('Movie')
        ) {
            return 'TV & movies';
        }
        if (selected.length === order.types.length) return 'All formats';
        if (selected.length === 1) return selected[0];

        return `${selected.length} formats`;
    });

    function toggleType(type: string) {
        if (selectedTypes.length === 1 && selectedTypes.includes(type)) return;

        selectedTypes = selectedTypes.includes(type)
            ? selectedTypes.filter((selected) => selected !== type)
            : [...selectedTypes, type];
    }

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
    <div class="mb-6 flex min-h-10 items-start justify-between gap-4">
        <h2 id="franchise-order-title" class="pt-2 text-lg font-semibold">
            Franchise Order
        </h2>

        <Dropdown
            id="franchise-format-filter"
            ariaLabel="Franchise format filter"
            openOnHover
            menuClass="w-36 py-2"
            triggerClass="block min-h-9 cursor-pointer bg-panel px-3 transition-colors hover:bg-panel-hover peer-checked:bg-panel-hover"
        >
            {#snippet trigger()}
                <span class="flex min-h-9 items-center gap-2.5 text-sm font-medium">
                    <span>{selectedLabel}</span>
                    <CaretDownIcon size="0.9rem" weight="bold" aria-hidden="true" />
                </span>
            {/snippet}

            {#snippet content()}
                {#each order.types as type}
                    <label
                        class="flex min-h-10 cursor-pointer items-center gap-3 px-3 text-sm font-medium whitespace-nowrap transition-colors hover:bg-panel-hover focus-within:bg-panel-hover"
                    >
                        <input
                            type="checkbox"
                            class="peer sr-only"
                            checked={selectedTypes.includes(type.label)}
                            disabled={selectedTypes.length === 1 &&
                                selectedTypes.includes(type.label)}
                            onchange={() => toggleType(type.label)}
                        />
                        <span
                            class:border-player-accent={selectedTypes.includes(type.label)}
                            class:border-muted={!selectedTypes.includes(type.label)}
                            class:text-player-accent={selectedTypes.includes(type.label)}
                            class="grid size-4 shrink-0 place-items-center border transition-colors peer-focus-visible:ring-1 peer-focus-visible:ring-player-accent peer-disabled:opacity-60"
                            aria-hidden="true"
                        >
                            {#if selectedTypes.includes(type.label)}
                                <CheckIcon size="0.875rem" weight="bold" />
                            {/if}
                        </span>
                        <span>{type.label}</span>
                    </label>
                {/each}
            {/snippet}
        </Dropdown>
    </div>

    {#if visibleEntries.length}
        <div class="relative">
            <div
                bind:this={track}
                class="grid auto-cols-franchise grid-flow-col gap-x-5 gap-y-8 overflow-x-auto scroll-smooth md:auto-cols-franchise-md 2xl:auto-cols-franchise-2xl"
                onscroll={updateScrollState}
            >
                {#each visibleEntries as entry}
                    <a
                        href={entry.href}
                        class="group min-w-0 focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none"
                        aria-current={entry.anilistId === currentAnimeId
                            ? 'page'
                            : undefined}
                    >
                        <div class="aspect-2/3 overflow-hidden bg-surface">
                            <img
                                src={entry.imageUrl}
                                alt=""
                                class="size-full object-cover transition-opacity duration-150 group-hover:opacity-80"
                                loading="lazy"
                            />
                        </div>
                        <h3 class="mt-3 line-clamp-2 text-sm leading-snug font-normal text-foreground">
                            {entry.title}
                        </h3>
                        {#if entry.anilistId === currentAnimeId}
                            <span class="mt-3 block h-0.5 w-full bg-foreground" aria-hidden="true"></span>
                        {/if}
                    </a>
                {/each}
            </div>

            {#if canScrollBack}
                <button
                    type="button"
                    class="absolute top-1/2 left-1 grid size-10 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:ring-1 focus-visible:ring-white focus-visible:outline-none"
                    aria-label="Previous franchise titles"
                    onclick={() => scrollByPage(-1)}
                >
                    <CaretLeftIcon size="1.75rem" weight="bold" aria-hidden="true" />
                </button>
            {/if}

            {#if canScrollForward}
                <button
                    type="button"
                    class="absolute top-1/2 right-1 grid size-10 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:ring-1 focus-visible:ring-white focus-visible:outline-none"
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
