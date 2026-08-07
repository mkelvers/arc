<script lang="ts">
  import { onMount } from 'svelte';
  import {
    BookmarkSimpleIcon,
    CaretLeftIcon,
    CaretRightIcon,
    PauseIcon,
    PlayIcon,
  } from 'phosphor-svelte';
  import { cn } from '$lib/utils';
  import Tooltip from '$lib/components/Tooltip.svelte';

  interface Highlight {
    id: number;
    href: string;
    watchHref: string;
    title: string;
    image: string;
    logoUrl: string;
    logoSize: number;
    episodeLabel: string;
    format: string;
    audioLabel: string;
    genres: string[];
    description: string;
  }

  interface Props {
    highlights: Highlight[];
  }

  let { highlights }: Props = $props();
  let active = $state(0);
  let paused = $state(false);
  let focused = $state(false);

  function select(index: number) {
    if (!highlights.length) {
      return;
    }

    active = (index + highlights.length) % highlights.length;
  }

  onMount(() => {
    if (highlights.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const interval = window.setInterval(() => {
      if (!paused && !focused) {
        select(active + 1);
      }
    }, 10_000);

    return () => window.clearInterval(interval);
  });
</script>

{#if highlights.length}
  <section
    class="relative isolate h-[calc(100svh+6rem)] min-h-180 overflow-hidden bg-black 2xl:h-[100svh]"
    aria-roledescription="carousel"
    aria-label="Popular anime this week"
    onfocusin={() => (focused = true)}
    onfocusout={() => (focused = false)}
  >
    {#each highlights as anime, index (anime.id)}
      {#if index === active}
        <article
          class="home-hero-slide absolute inset-0 grid grid-cols-1 grid-rows-1 overflow-hidden"
        >
          <a
            href={anime.href}
            class="col-start-1 row-start-1 block focus-visible:outline-2 focus-visible:outline-white"
            aria-label={`View ${anime.title}`}
          >
            <img
              src={anime.image}
              alt=""
              class="size-full object-cover object-center"
              loading={index === 0 ? 'eager' : 'lazy'}
              fetchpriority={index === 0 ? 'high' : 'auto'}
            />
          </a>

          <div
            class="pointer-events-none z-20 col-start-1 row-start-1 min-w-0 self-end px-5 pb-80 sm:px-10 lg:px-16 2xl:self-center 2xl:pb-0"
          >
            <a
              href={anime.href}
              class="pointer-events-auto block w-fit focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              aria-label={`View ${anime.title}`}
            >
              <img
                src={anime.logoUrl}
                alt={anime.title}
                style:height={`clamp(${(5 * anime.logoSize) / 100}rem, ${(5.7 * anime.logoSize) / 100}vw, ${(6.25 * anime.logoSize) / 100}rem)`}
                class="max-h-24 max-w-md object-contain object-left sm:max-h-32 lg:max-h-none lg:max-w-none"
              />
            </a>

            <p
              class="mt-7 flex max-w-[min(100%,46rem)] flex-wrap items-center gap-y-1 text-xs font-medium text-white/40 sm:text-sm 2xl:mt-8 2xl:text-sm"
            >
              <span class="hero-metadata__tag">{anime.format}</span>
              {#if anime.audioLabel}
                <span class="hero-metadata__tag">{anime.audioLabel}</span>
              {/if}
              {#if anime.genres.length}
                <span class="hero-metadata__tag">{anime.genres.slice(0, 3).join(', ')}</span>
              {/if}
            </p>

            {#if anime.description}
              <p
                class="mt-4 line-clamp-3 max-w-[min(100%,46rem)] text-sm leading-6 text-white/80 sm:text-base 2xl:text-base 2xl:leading-7 min-[120.1rem]:line-clamp-none min-[120.1rem]:max-w-[min(100%,48rem)]"
              >
                {anime.description}
              </p>
            {/if}

            <div
              class="pointer-events-auto mt-7 flex flex-wrap items-center gap-2 text-xs font-bold text-accent sm:text-sm"
            >
              <a
                href={anime.watchHref}
                class="inline-flex min-h-10 items-center gap-2 bg-accent px-4 text-on-accent transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white 2xl:min-h-12 2xl:px-5 2xl:text-sm"
              >
                <PlayIcon size="1.2rem" weight="bold" aria-hidden="true" />
                START WATCHING {anime.episodeLabel}
              </a>
              <Tooltip text="Add to Watchlist">
                <button
                  type="button"
                  class="grid size-10 shrink-0 place-items-center border border-accent text-accent opacity-60 2xl:size-12"
                  aria-label="Add to watchlist (coming soon)"
                  disabled
                >
                  <BookmarkSimpleIcon size="1.35rem" weight="regular" aria-hidden="true" />
                </button>
              </Tooltip>
            </div>

            {#if highlights.length > 1}
              <div class="pointer-events-auto mt-4 flex items-center gap-2 2xl:mt-5">
                <button
                  type="button"
                  class="grid size-8 place-items-center text-white/70 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                  aria-label={paused ? 'Play carousel' : 'Pause carousel'}
                  aria-pressed={paused}
                  onclick={() => (paused = !paused)}
                >
                  {#if paused}
                    <PlayIcon size="1rem" weight="fill" aria-hidden="true" />
                  {:else}
                    <PauseIcon size="1rem" weight="fill" aria-hidden="true" />
                  {/if}
                </button>

                {#each highlights as item, itemIndex (item.id)}
                  <button
                    type="button"
                    class={cn(
                      'h-2 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                      itemIndex === active ? 'w-6 bg-white' : 'w-2 bg-white/45'
                    )}
                    aria-label={`Show ${item.title}`}
                    aria-current={itemIndex === active ? 'true' : undefined}
                    onclick={() => select(itemIndex)}
                  >
                    <span class="sr-only">
                      Show {item.title}
                    </span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </article>
      {/if}
    {/each}

    {#if highlights.length > 1}
      <button
        type="button"
        class="absolute top-[calc((100svh-3.5rem)/2)] left-2 z-30 grid size-11 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white sm:left-5"
        aria-label="Previous anime"
        onclick={() => select(active - 1)}
      >
        <CaretLeftIcon size="1.7rem" weight="bold" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="absolute top-[calc((100svh-3.5rem)/2)] right-2 z-30 grid size-11 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white sm:right-5"
        aria-label="Next anime"
        onclick={() => select(active + 1)}
      >
        <CaretRightIcon size="1.7rem" weight="bold" aria-hidden="true" />
      </button>
    {/if}
  </section>
{/if}

<style>
  .hero-metadata__tag:not(:first-child)::before {
    width: 0.25rem;
    height: 0.25rem;
    margin-inline: 0.25rem;
    display: inline-block;
    background-color: currentcolor;
    content: '';
    line-height: 1;
    vertical-align: middle;
    transform: rotate(45deg);
  }
</style>
