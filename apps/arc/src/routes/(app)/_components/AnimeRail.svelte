<script lang="ts">
    import type { AnimeCard as AnimeCardModel } from '@arc/core/client';
    import { cn } from '$lib/utils';
    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import HorizontalRail from '$lib/components/ui/HorizontalRail.svelte';
    import { m } from '$lib/i18n.svelte';

    interface Props {
        anime: AnimeCardModel[];
        heading: string;
        headingId: string;
        topSpacing?: boolean;
    }

    let { anime, heading, headingId, topSpacing = true }: Props = $props();
</script>

<section
    class={cn(
        'relative z-20 pb-10 [content-visibility:auto] [contain-intrinsic-size:24rem] sm:pb-12 lg:pb-16',
        topSpacing && 'pt-10 sm:pt-12 lg:pt-16'
    )}
    aria-labelledby={headingId}
>
    <h2 id={headingId} class="mb-5 px-4 text-xl font-bold sm:px-10 sm:text-2xl lg:px-16 2xl:px-16">
        {heading}
    </h2>

    {#if anime.length}
        <HorizontalRail
            label={heading}
            controlOffset={0.75}
            trackClass="scrollbar-hidden grid grid-flow-col auto-cols-[calc((100vw-2.75rem)/2)] gap-3 overflow-x-auto overscroll-x-contain px-4 pb-4 scroll-smooth min-[30em]:auto-cols-[calc((100vw-4rem)/3)] min-[35.5em]:auto-cols-[calc((100vw-4.75rem)/4)] sm:auto-cols-[calc((100vw-7.75rem)/4)] sm:gap-4 sm:px-10 lg:auto-cols-[calc((100vw-17.375rem)/5)] lg:gap-7.5 lg:px-16 2xl:auto-cols-[calc((100vw-19.25rem)/6)] 2xl:gap-7.5 2xl:px-16 hero:auto-cols-[calc((100vw-16.875rem)/7)] hero:gap-6 hero:px-16"
        >
            {#snippet children()}
                {#each anime as entry (entry.id)}
                    <div class="min-w-0">
                        <AnimeCard anime={entry} compact />
                    </div>
                {/each}
            {/snippet}
        </HorizontalRail>
    {/if}
</section>
