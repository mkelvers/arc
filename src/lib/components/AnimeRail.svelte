<script lang="ts">
    import type { AnimeCard as AnimeCardModel } from '$lib/anime/types';
    import { cn } from '$lib/utils';
    import { CaretLeftIcon, CaretRightIcon } from 'phosphor-svelte';
    import AnimeCard from './AnimeCard.svelte';

    interface Props {
        anime: AnimeCardModel[];
        heading: string;
        headingId: string;
        emptyMessage: string;
        overlap?: boolean;
        topSpacing?: boolean;
    }

    let {
        anime,
        heading,
        headingId,
        emptyMessage,
        overlap = false,
        topSpacing = true,
    }: Props = $props();
    let rail = $state<HTMLDivElement>();
    let canScrollLeft = $state(false);
    let canScrollRight = $state(false);

    function updateScroll() {
        if (!rail) {
            return;
        }

        canScrollLeft = rail.scrollLeft > 2;
        canScrollRight =
            rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2;
    }

    function move(direction: -1 | 1) {
        rail?.scrollBy({
            left: direction * rail.clientWidth * 0.82,
            behavior: 'smooth',
        });
    }

    $effect(() => {
        if (!rail) {
            return;
        }

        updateScroll();
        const observer = new ResizeObserver(updateScroll);
        observer.observe(rail);

        return () => observer.disconnect();
    });
</script>

<section
    class={cn(
        'relative z-20 px-5 pb-10 sm:px-10 sm:pb-12 lg:px-16 lg:pb-16',
        topSpacing && 'pt-10 sm:pt-12 lg:pt-16',
        overlap && '-mt-72',
    )}
    aria-labelledby={headingId}
>
    <h2 id={headingId} class="mb-5 text-xl font-bold sm:text-2xl">
        {heading}
    </h2>

    {#if anime.length}
        <div class="relative">
            <div
                bind:this={rail}
                onscroll={updateScroll}
                class="-mx-2 grid snap-x snap-mandatory grid-flow-col auto-cols-franchise gap-2 overflow-x-auto overscroll-x-contain scroll-smooth sm:auto-cols-[30%] sm:gap-3 md:auto-cols-[23%] lg:auto-cols-[18%] xl:auto-cols-[15%]"
            >
                {#each anime as entry (entry.id)}
                    <div class="min-w-0 snap-start">
                        <AnimeCard anime={entry} compact />
                    </div>
                {/each}
            </div>

            {#if canScrollLeft}
                <button
                    type="button"
                    class="absolute top-[42%] -left-3 z-30 grid size-12 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white"
                    aria-label={`Scroll ${heading.toLocaleLowerCase()} left`}
                    onclick={() => move(-1)}
                >
                    <CaretLeftIcon
                        size="1.65rem"
                        weight="bold"
                        aria-hidden="true"
                    />
                </button>
            {/if}

            {#if canScrollRight}
                <button
                    type="button"
                    class="absolute top-[42%] -right-3 z-30 grid size-12 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white"
                    aria-label={`Scroll ${heading.toLocaleLowerCase()} right`}
                    onclick={() => move(1)}
                >
                    <CaretRightIcon
                        size="1.65rem"
                        weight="bold"
                        aria-hidden="true"
                    />
                </button>
            {/if}
        </div>
    {:else}
        <p class="text-sm text-muted">{emptyMessage}</p>
    {/if}
</section>
