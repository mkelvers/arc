<script lang="ts">
    import type { AnimeEpisode } from '$lib/types';
    import EpisodeGridCard from './EpisodeGridCard.svelte';

    interface Props {
        episodes?: AnimeEpisode[];
        title: string;
        image?: string | null;
        loading?: boolean;
    }

    let { episodes = [], title, image = null, loading = false }: Props = $props();
</script>

<section id="anime-episode-list" class="py-7 sm:pb-12 lg:pb-16" aria-busy={loading} aria-live="polite">
    {#if loading}
        <span class="sr-only">Loading episodes</span>
        <div class="grid grid-cols-1 gap-x-5 gap-y-8 md:grid-cols-5 2xl:grid-cols-7">
            {#each Array.from({ length: 5 }) as _}
                <div class="min-h-56 animate-pulse motion-reduce:animate-none" aria-hidden="true">
                    <div class="aspect-video bg-surface"></div>
                    <div class="mt-3 h-3 w-2/3 rounded-full bg-surface"></div>
                    <div class="mt-2 h-4 w-4/5 rounded-full bg-surface"></div>
                    <div class="mt-3 h-4 w-1/3 rounded-full bg-surface"></div>
                </div>
            {/each}
        </div>
    {:else if episodes.length}
        <div class="grid grid-cols-1 gap-x-5 gap-y-8 md:grid-cols-5 2xl:grid-cols-7">
            {#each episodes as episode}
                <EpisodeGridCard episode={episode} title={title} image={image} />
            {/each}
        </div>
    {/if}
</section>
