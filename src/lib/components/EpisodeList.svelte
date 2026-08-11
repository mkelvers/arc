<script lang="ts">
  import type { AnimeEpisode } from '$lib/anime/types';
  import EpisodeGridCard from './EpisodeGridCard.svelte';

  interface Props {
    episodes?: AnimeEpisode[];
    title: string;
    image?: string | null;
  }

  let { episodes = [], title, image = null }: Props = $props();
</script>

<section id="anime-episode-list" class="py-7 sm:pb-12 lg:pb-16">
  {#if episodes.length}
    <div class="grid grid-cols-1 gap-x-5 gap-y-8 md:grid-cols-5 2xl:grid-cols-7">
      {#each episodes as episode}
        <EpisodeGridCard episode={episode} title={title} image={image} />
      {/each}
    </div>
  {/if}
</section>
