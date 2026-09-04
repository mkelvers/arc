<script lang="ts">
    import { CaretRightIcon } from 'phosphor-svelte';

    import type { AnimeSearchResult } from '@arc/core/browser';
    import { cn } from '$lib/utils';
    import AnimeCard from '$lib/components/AnimeCard.svelte';
    import { m } from '$lib/i18n.svelte';

    interface Props {
        id: string;
        title: string;
        results: AnimeSearchResult[];
        onselect: (anime: AnimeSearchResult) => void;
    }

    let { id, title, results, onselect }: Props = $props();
    let expanded = $state(false);
    const visibleResults = $derived(expanded ? results : results.slice(0, 6));
</script>

{#if results.length}
    <section class="mt-10" aria-labelledby={id}>
        <h2 id={id} class="mb-3 text-xl font-bold">{title}</h2>
        <div class="grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {#each visibleResults as result (result.id)}
                <AnimeCard anime={result} variant="compact" onselect={() => onselect(result)} />
            {/each}
        </div>

        {#if results.length > 6}
            <button
                type="button"
                class="mt-2 inline-flex min-h-9 items-center gap-2 text-xs font-bold uppercase text-subtle transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-expanded={expanded}
                onclick={() => (expanded = !expanded)}
            >
                {expanded ? m.shared_show_less() : m.shared_see_more()}
                <CaretRightIcon
                    size="1rem"
                    weight="bold"
                    class={cn(expanded && 'rotate-180')}
                    aria-hidden="true"
                />
            </button>
        {/if}
    </section>
{/if}
