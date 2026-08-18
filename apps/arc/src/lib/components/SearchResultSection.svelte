<script lang="ts">
    import { CaretRightIcon } from 'phosphor-svelte';

    import type { AnimeSearchResult } from '$lib/search';
    import AnimeCard from '$lib/components/AnimeCard.svelte';

    interface Props {
        id: string;
        title: string;
        results: AnimeSearchResult[];
        onselect?: (anime: AnimeSearchResult) => void;
    }

    let { id, title, results, onselect }: Props = $props();
    let expanded = $state(false);
</script>

{#if results.length}
    <section class="mt-10" aria-labelledby={id}>
        <h2 id={id} class="mb-3 text-xl font-bold">{title}</h2>
        <div class="-mx-2 grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {#each expanded ? results : results.slice(0, 6) as result (result.id)}
                <AnimeCard anime={result} variant="compact" onselect={() => onselect?.(result)} />
            {/each}
        </div>

        {#if results.length > 6}
            <button
                type="button"
                class="mt-2 inline-flex min-h-9 items-center gap-2 text-xs font-bold uppercase text-subtle transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-expanded={expanded}
                onclick={() => (expanded = !expanded)}
            >
                {expanded ? 'Show less' : 'See more'}
                <CaretRightIcon
                    size="1rem"
                    weight="bold"
                    class={expanded ? 'rotate-180' : ''}
                    aria-hidden="true"
                />
            </button>
        {/if}
    </section>
{/if}
