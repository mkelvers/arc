<script lang="ts">
  import { BookmarkSimpleIcon, PlayIcon, StarIcon } from 'phosphor-svelte';

  import type { AnimeSearchResult } from '$lib/anime/search';
  import Tooltip from '$lib/components/Tooltip.svelte';

  interface Props {
    anime: AnimeSearchResult;
    onselect?: (anime: AnimeSearchResult) => void;
  }

  let { anime, onselect }: Props = $props();
</script>

<article class="group relative min-w-0 transition-colors hover:bg-surface focus-within:bg-surface">
  <a
    href={anime.href}
    class="absolute inset-0 z-0 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
    aria-label={`View ${anime.title}`}
    onclick={() => onselect?.(anime)}
  >
    <span class="sr-only">View {anime.title}</span>
  </a>

  <div class="flex min-h-28 gap-3 p-2">
    <div class="aspect-2/3 h-24 shrink-0 overflow-hidden bg-surface">
      <img src={anime.image} alt="" class="size-full object-cover" loading="lazy" />
    </div>

    <div class="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col py-1">
      <h3 class="line-clamp-1 text-sm leading-snug font-semibold">{anime.title}</h3>
      {#if anime.genres.length}
        <p class="mt-1.5 line-clamp-1 text-xs text-muted">
          {anime.genres.slice(0, 3).join(' · ')}
        </p>
      {/if}

      {#if anime.caption}
        <p
          class="mt-auto text-sm text-muted transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
        >
          {anime.caption}
        </p>
      {/if}

      <div
        class="pointer-events-none absolute right-0 bottom-0 left-0 flex items-center justify-between gap-3 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      >
        {#if anime.score}
          <p class="flex items-center gap-1 text-sm text-muted">
            <span>{anime.score}%</span>
            <StarIcon size="1em" weight="fill" aria-hidden="true" />
            <span class="sr-only">AniList score</span>
          </p>
        {/if}

        <div class="ml-auto flex items-center gap-1 text-accent">
          <Tooltip text="Play E1">
            <a
              href={anime.watchHref}
              class="grid size-9 place-items-center focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent"
              aria-label={`Start watching ${anime.title}`}
              onclick={() => onselect?.(anime)}
            >
              <PlayIcon size="1.45rem" weight="bold" aria-hidden="true" />
            </a>
          </Tooltip>
          <Tooltip text="Add to Watchlist">
            <button
              type="button"
              class="grid size-9 place-items-center opacity-60"
              aria-label={`Add ${anime.title} to watchlist (coming soon)`}
              disabled
            >
              <BookmarkSimpleIcon size="1.45rem" weight="regular" aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  </div>
</article>
