<script lang="ts">
    import type { AnimeCard as AnimeCardModel } from '@arc/shared/types';
    import { cn } from '$lib/utils';
    import { CaretLeftIcon, CaretRightIcon } from 'phosphor-svelte';
    import AnimeCard from '$lib/components/AnimeCard.svelte';

    interface Props {
        anime: AnimeCardModel[];
        heading: string;
        headingId: string;
        emptyMessage: string;
        topSpacing?: boolean;
    }

    let { anime, heading, headingId, emptyMessage, topSpacing = true }: Props = $props();
    let rail = $state<HTMLDivElement>();
    let canScrollLeft = $state(false);
    let canScrollRight = $state(false);

    function updateScroll() {
        if (!rail) {
            return;
        }

        canScrollLeft = rail.scrollLeft > 2;
        canScrollRight = rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2;

        const firstCard = rail.firstElementChild;
        if (firstCard instanceof HTMLElement) {
            const posterCenter = 8 + Math.max(0, firstCard.clientWidth - 16) * 0.75;
            rail.parentElement?.style.setProperty('--rail-control-center', `${posterCenter}px`);
        }
    }

    function move(direction: -1 | 1) {
        if (!rail) {
            return;
        }

        const firstCard = rail.children[0];
        const secondCard = rail.children[1];
        const measuredPitch =
            firstCard instanceof HTMLElement && secondCard instanceof HTMLElement
                ? secondCard.offsetLeft - firstCard.offsetLeft
                : rail.clientWidth;
        const cardPitch = measuredPitch > 0 ? measuredPitch : rail.clientWidth;
        const cardsPerPage = Math.max(1, Math.floor(rail.clientWidth / cardPitch));

        rail.scrollBy({
            left: direction * cardsPerPage * cardPitch,
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
    class={cn('relative z-20 pb-10 sm:pb-12 lg:pb-16', topSpacing && 'pt-10 sm:pt-12 lg:pt-16')}
    aria-labelledby={headingId}
>
    <h2 id={headingId} class="mb-5 px-5 text-xl font-bold sm:px-10 sm:text-2xl lg:px-16 2xl:px-20">
        {heading}
    </h2>

    {#if anime.length}
        <div class="relative [--rail-control-center:50%]">
            <div
                bind:this={rail}
                onscroll={updateScroll}
                class="grid grid-flow-col auto-cols-[calc((100vw-1.875rem)/2)] gap-0 overflow-x-auto overscroll-x-contain px-3 scroll-smooth min-[30em]:auto-cols-[calc((100vw-2.8125rem)/3)] min-[35.5em]:auto-cols-[calc((100vw-2.5rem)/4)] sm:auto-cols-[calc((100vw-5.6875rem)/4)] sm:gap-1 sm:px-8 lg:auto-cols-[calc((100vw-10.875rem)/5)] lg:gap-3.5 lg:px-14 2xl:auto-cols-[calc((100vw-12.75rem)/6)] 2xl:px-[4.5rem] min-[120rem]:auto-cols-[calc((100vw-13.625rem)/7)]"
            >
                {#each anime as entry (entry.id)}
                    <div class="min-w-0">
                        <AnimeCard anime={entry} compact />
                    </div>
                {/each}
            </div>

            {#if canScrollLeft}
                <button
                    type="button"
                    class="absolute top-[var(--rail-control-center)] left-0 z-30 grid size-12 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white"
                    aria-label={`Scroll ${heading.toLocaleLowerCase()} left`}
                    onclick={() => move(-1)}
                >
                    <CaretLeftIcon size="1.65rem" weight="bold" aria-hidden="true" />
                </button>
            {/if}

            {#if canScrollRight}
                <button
                    type="button"
                    class="absolute top-[var(--rail-control-center)] right-0 z-30 grid size-12 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white"
                    aria-label={`Scroll ${heading.toLocaleLowerCase()} right`}
                    onclick={() => move(1)}
                >
                    <CaretRightIcon size="1.65rem" weight="bold" aria-hidden="true" />
                </button>
            {/if}
        </div>
    {:else}
        <p class="px-5 text-sm text-muted sm:px-10 lg:px-16 2xl:px-20">{emptyMessage}</p>
    {/if}
</section>
