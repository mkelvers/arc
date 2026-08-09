<script lang="ts">
  import { PlayIcon, StarIcon } from 'phosphor-svelte';

  import type { AnimeSearchResult } from '$lib/anime/search';
  import Tooltip from '$lib/components/Tooltip.svelte';
  import WatchlistBookmark from '$lib/components/WatchlistBookmark.svelte';

  interface Props {
    anime: AnimeSearchResult;
    onselect?: (anime: AnimeSearchResult) => void;
  }

  let { anime, onselect }: Props = $props();
</script>

<article class="group relative min-w-0 overflow-hidden text-foreground">
  <div class="transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
    <a
      href={anime.href}
      class="block focus-visible:outline-none"
      aria-label={`View ${anime.title}`}
      onclick={() => onselect?.(anime)}
    >
      <div class="aspect-video overflow-hidden bg-surface">
        <img
          src={anime.backdrop ?? anime.image}
          alt=""
          class="size-full object-cover"
          loading="lazy"
        />
      </div>
      <h3 class="mt-3 line-clamp-2 min-h-10 text-sm leading-snug font-semibold">
        {anime.title}
      </h3>
      {#if anime.caption}
        <p class="mt-1.5 text-sm text-muted">{anime.caption}</p>
      {/if}
    </a>
  </div>

  <div
    class="pointer-events-none absolute inset-0 flex flex-col overflow-hidden bg-surface p-4 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
  >
    <a
      href={anime.href}
      class="absolute inset-0 z-0 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
      aria-label={`View ${anime.title}`}
      onclick={() => onselect?.(anime)}
    >
      <span class="sr-only">View {anime.title}</span>
    </a>

    <h3 class="pointer-events-none relative z-10 line-clamp-2 text-sm leading-snug font-semibold">
      {anime.title}
    </h3>

    {#if anime.score}
      <p
        class="pointer-events-none relative z-10 mt-2.5 flex items-center gap-1 text-sm text-muted"
      >
        <span>{anime.score}%</span>
        <StarIcon size="1em" weight="fill" aria-hidden="true" />
        <span class="sr-only">AniList score</span>
      </p>
    {/if}

    {#if anime.genres.length}
      <p class="pointer-events-none relative z-10 mt-2.5 line-clamp-1 text-xs text-muted">
        {anime.genres.slice(0, 4).join(' · ')}
      </p>
    {/if}

    {#if anime.synopsis}
      <p
        class="pointer-events-none relative z-10 mt-3 line-clamp-4 text-xs leading-relaxed text-muted"
      >
        {anime.synopsis}
      </p>
    {/if}

    <div class="relative z-10 mt-auto flex items-center gap-2 pt-3 text-accent">
      <Tooltip text="Play E1">
        <a
          href={anime.watchHref}
          class="grid size-9 place-items-center focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent"
          aria-label={`Start watching ${anime.title}`}
          onclick={() => onselect?.(anime)}
        >
          <PlayIcon size="1.55rem" weight="bold" aria-hidden="true" />
        </a>
      </Tooltip>
      <WatchlistBookmark animeId={anime.id} title={anime.title} />
    </div>
  </div>
</article>
