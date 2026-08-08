<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { EpisodeSkipTimes } from '$lib/player/skip-times';
  import type { Sources } from '$lib/player/media';
  import { SpinnerGapIcon } from 'phosphor-svelte';
  import VideoPlayer from './VideoPlayer.svelte';

  interface Playback {
    streams: Sources;
    streamError: boolean;
  }

  interface Props {
    animeId: number;
    canEditSkipTimes: boolean;
    episodeId: string;
    episodeNumber: number;
    label: string;
    next?: string | null;
    playback: Promise<Playback>;
    poster?: string | null;
    skipTimes: Promise<EpisodeSkipTimes>;
    startAt?: number;
  }

  interface ActiveEpisode {
    animeId: number;
    canEditSkipTimes: boolean;
    episodeId: string;
    episodeNumber: number;
    label: string;
    next: string | null;
    poster: string | null;
    result: Playback;
    skipTimes: EpisodeSkipTimes;
    startAt: number;
  }

  let {
    animeId,
    canEditSkipTimes,
    episodeId,
    episodeNumber,
    label,
    next = null,
    playback,
    poster = null,
    skipTimes,
    startAt = 0,
  }: Props = $props();
  let active = $state<ActiveEpisode | null>(null);
  let transitioning = $state(true);
  let retrying = $state(false);

  $effect(() => {
    const playbackRequest = playback;
    const skipTimesRequest = skipTimes;
    const pending = {
      animeId,
      canEditSkipTimes,
      episodeId,
      episodeNumber,
      label,
      next,
      poster,
      startAt,
    };
    let cancelled = false;
    transitioning = true;

    void playbackRequest.then((result) => {
      if (cancelled) {
        return;
      }

      active = {
        ...pending,
        result,
        skipTimes: { opening: null, ending: null, source: null },
      };
      transitioning = false;

      void skipTimesRequest
        .then((resolved) => {
          if (
            cancelled ||
            active?.animeId !== pending.animeId ||
            active.episodeId !== pending.episodeId
          ) {
            return;
          }

          active = { ...active, skipTimes: resolved };
        })
        .catch(() => undefined);
    });

    return () => {
      cancelled = true;
    };
  });

  async function retry() {
    retrying = true;

    try {
      await invalidateAll();
    } finally {
      retrying = false;
    }
  }
</script>

{#if active}
  <VideoPlayer
    animeId={active.animeId}
    episodeId={active.episodeId}
    episodeNumber={active.episodeNumber}
    sources={active.result.streams}
    label={active.label}
    poster={active.poster}
    next={active.next}
    startAt={active.startAt}
    skipTimes={active.skipTimes}
    canEditSkipTimes={active.canEditSkipTimes}
    unavailable={!Object.values(active.result.streams).some((streams) => streams?.length)}
    streamError={active.result.streamError}
    transitioning={transitioning}
    retrying={retrying}
    onretry={retry}
  />
{:else}
  <section
    aria-label={`${label} player`}
    aria-busy="true"
    class="relative grid aspect-21/9 w-full place-items-center overflow-hidden bg-black px-6 text-center"
  >
    {#if poster}
      <img
        src={poster}
        alt=""
        class="absolute inset-0 size-full scale-105 object-cover opacity-35 blur-xl"
      />
    {/if}
    <SpinnerGapIcon
      role="status"
      aria-label="Loading video"
      size="2.5rem"
      weight="bold"
      class="relative animate-spin text-accent"
    />
  </section>
{/if}
