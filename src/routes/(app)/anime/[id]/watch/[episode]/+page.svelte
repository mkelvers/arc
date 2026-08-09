<script lang="ts">
  import { audioAvailabilityLabel } from '$lib/anime/audio';
  import EpisodeDialog from '$lib/components/EpisodeDialog.svelte';
  import WatchEpisodeCard from '$lib/components/WatchEpisodeCard.svelte';
  import WatchPlayer from '$lib/components/WatchPlayer.svelte';
  import { availableModes } from '$lib/player/media';
  import { formatDate } from '$lib/utils';
  import type { PageProps } from './$types';
  import { ArchiveIcon } from 'phosphor-svelte';

  let { data }: PageProps = $props();
  let episodeDialogOpen = $state(false);
  let renderedEpisodeId = $state<string>();

  const poster = $derived(data.currentEpisode.image ?? data.fallbackImage);
  const heading = $derived(
    data.currentEpisode.title
      ? `${data.currentEpisode.label} – ${data.currentEpisode.title}`
      : data.currentEpisode.label
  );

  $effect(() => {
    if (renderedEpisodeId === undefined) {
      renderedEpisodeId = data.currentEpisode.id;
      return;
    }
    if (renderedEpisodeId === data.currentEpisode.id) {
      return;
    }

    renderedEpisodeId = data.currentEpisode.id;
    episodeDialogOpen = false;
  });
</script>

<main class="min-h-dvh">
  <WatchPlayer
    playback={data.playback}
    animeId={data.anime.id}
    episodeId={data.currentEpisode.id}
    episodeNumber={data.currentEpisode.number}
    label={heading}
    poster={poster}
    next={data.nextEpisode?.href}
    startAt={data.startAt}
    skipTimes={data.skipTimes}
    segmentTemplates={data.segmentTemplates}
    canEditSkipTimes={data.canEditSkipTimes}
  />

  <div
    class="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-11 sm:px-8 lg:flex-row lg:px-0 lg:py-12"
  >
    <article class="min-w-0 flex-1">
      <a href={`/anime/${data.anime.id}`} class="text-sm font-bold text-accent hover:underline">
        {data.anime.title}
      </a>
      <h1 class="mt-4 text-xl leading-tight font-bold">
        {heading}
      </h1>

      <p class="mt-3 text-sm text-watch-muted">
        {#await data.playback}
          {audioAvailabilityLabel(data.currentEpisode.audio)}
        {:then playback}
          {audioAvailabilityLabel(
            availableModes(playback.streams).length
              ? availableModes(playback.streams)
              : data.currentEpisode.audio
          )}
        {/await}
        {#if data.currentEpisode.duration}
          <span aria-hidden="true"> · </span>
          {data.currentEpisode.duration}
        {/if}
      </p>
      {#if data.currentEpisode.releaseDate}
        <p class="mt-2 text-sm text-watch-secondary">
          Released on {formatDate(data.currentEpisode.releaseDate)}
        </p>
      {/if}

      {#if data.currentEpisode.overview}
        <p class="mt-5 max-w-4xl text-base leading-6 text-watch-primary">
          {data.currentEpisode.overview}
        </p>
      {/if}
    </article>

    <aside class="space-y-7 lg:w-72 lg:shrink-0">
      {#if data.nextEpisode}
        <section>
          <h2 class="mb-3 text-xs font-bold uppercase">Next episode</h2>
          <WatchEpisodeCard episode={data.nextEpisode} image={data.fallbackImage} />
        </section>
      {/if}

      {#if data.previousEpisode}
        <section>
          <h2 class="mb-3 text-xs font-bold uppercase">Previous episode</h2>
          <WatchEpisodeCard episode={data.previousEpisode} image={data.fallbackImage} />
        </section>
      {/if}

      <button
        type="button"
        class="flex min-h-10 w-fit items-center gap-2.5 border-2 border-watch-secondary px-4 text-xs font-bold text-watch-primary uppercase hover:border-white hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        aria-haspopup="dialog"
        onclick={() => (episodeDialogOpen = true)}
      >
        <ArchiveIcon size="1.6rem" weight="bold" aria-hidden="true" />
        See more episodes
      </button>
    </aside>
  </div>
</main>

<EpisodeDialog
  open={episodeDialogOpen}
  title={data.anime.title}
  episodes={data.episodes}
  currentId={data.currentEpisode.id}
  image={data.fallbackImage}
  onclose={() => (episodeDialogOpen = false)}
/>
