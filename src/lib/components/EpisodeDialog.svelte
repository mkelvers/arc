<script lang="ts">
  import type { AnimeEpisode } from '$lib/anime/types';
  import { XIcon } from 'phosphor-svelte';
  import EpisodeGridCard from './EpisodeGridCard.svelte';

  interface Props {
    open: boolean;
    title: string;
    episodes: AnimeEpisode[];
    currentId: string;
    image?: string | null;
    onclose: () => void;
  }

  let { open, title, episodes, currentId, image = null, onclose }: Props = $props();
  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  });

  function backdropClick(event: MouseEvent) {
    if (event.target === dialog) {
      onclose();
    }
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="episode-dialog-title"
  class="m-auto h-11/12 max-h-screen w-11/12 max-w-5xl overflow-hidden bg-panel p-0 text-white backdrop:bg-black/75"
  onclick={backdropClick}
  oncancel={onclose}
  onclose={onclose}
>
  <div class="flex h-full flex-col">
    <header
      class="flex min-h-20 shrink-0 items-center border-b border-black/15 bg-panel-strong px-5 sm:px-8"
    >
      <h2 id="episode-dialog-title" class="line-clamp-1 text-lg font-bold sm:text-xl">
        {title}
      </h2>
      <button
        type="button"
        class="ml-auto grid size-11 place-items-center hover:bg-white/8 focus-visible:outline-1 focus-visible:outline-white"
        aria-label="Close episode list"
        onclick={onclose}
      >
        <XIcon size="1.75rem" weight="bold" aria-hidden="true" />
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 lg:px-10">
      <div class="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {#each episodes as episode}
          <EpisodeGridCard
            episode={episode}
            title={title}
            image={image}
            current={episode.id === currentId}
            context="dialog"
          />
        {/each}
      </div>
    </div>
  </div>
</dialog>
