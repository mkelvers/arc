<script lang="ts">
    import { onMount } from 'svelte';
    import { CaretLeftIcon, CaretRightIcon, PlayIcon } from 'phosphor-svelte';
    import { cn } from '$lib/utils';
    import WatchlistBookmark from '$lib/components/WatchlistBookmark.svelte';

    interface Highlight {
        id: number;
        href: string;
        link: string;
        title: string;
        image: string;
        logo: {
            url: string;
            size: number;
        };
        episodeLabel: string;
        audioLabel: string;
        genres: string[];
        description: string;
    }

    interface Props {
        highlights: Highlight[];
    }

    type ProgressMode = 'animated' | 'complete';

    let { highlights }: Props = $props();
    let active = $state(0);
    let previous = $state<number | null>(null);
    let progression = $state(0);
    let progressMode = $state<ProgressMode>('animated');
    let reducedMotion = $state(false);
    const activeAnime = $derived(highlights[active]);
    const autoRotate = $derived(highlights.length > 1 && !reducedMotion);

    const slideDuration = 10_000;

    function select(index: number, mode: ProgressMode = 'animated') {
        if (!highlights.length) {
            return;
        }

        const next = (index + highlights.length) % highlights.length;
        previous = next === active || reducedMotion ? null : active;
        active = next;
        progressMode = mode;
        progression += 1;
    }

    onMount(() => {
        reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });

    $effect(() => {
        if (!autoRotate || progressMode !== 'complete') {
            return;
        }

        const next = active + 1;
        const timeout = window.setTimeout(() => select(next), slideDuration);

        return () => window.clearTimeout(timeout);
    });
</script>

{#if highlights.length}
    <section
        class="relative h-[calc(100svh+6rem)] min-h-180 overflow-hidden bg-black 2xl:h-svh"
        aria-roledescription="carousel"
        aria-label="Trending anime now"
    >
        {#if activeAnime}
            <article
                class="home-hero-slide absolute inset-0 grid grid-cols-1 grid-rows-1 overflow-hidden"
            >
                <a
                    href={activeAnime.href}
                    class="col-start-1 row-start-1 grid focus-visible:outline-2 focus-visible:outline-white"
                    aria-label={`View ${activeAnime.title}`}
                >
                    {#each highlights as anime, index (anime.id)}
                        {#if index === active || index === previous}
                            <img
                                src={anime.image}
                                alt=""
                                class={cn(
                                    'col-start-1 row-start-1 size-full object-cover object-center transition-opacity duration-500 ease-out motion-reduce:transition-none',
                                    index === active ? 'opacity-100' : 'opacity-0'
                                )}
                                loading={index === 0 ? 'eager' : 'lazy'}
                                fetchpriority={index === 0 ? 'high' : 'auto'}
                                ontransitionend={(event) => {
                                    if (event.propertyName === 'opacity' && index === previous) {
                                        previous = null;
                                    }
                                }}
                            />
                        {/if}
                    {/each}
                </a>

                <div
                    class="pointer-events-none z-30 col-start-1 row-start-1 min-w-0 self-end px-5 pb-80 sm:px-10 lg:px-16 2xl:self-center 2xl:pb-0"
                >
                    <a
                        href={activeAnime.href}
                        class="pointer-events-auto relative z-10 block w-fit focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                        aria-label={`View ${activeAnime.title}`}
                    >
                        <img
                            src={activeAnime.logo.url}
                            alt={activeAnime.title}
                            style:height={`clamp(${(5 * activeAnime.logo.size) / 100}rem, ${(6.4 * activeAnime.logo.size) / 100}vw, ${(8 * activeAnime.logo.size) / 100}rem)`}
                            class="max-w-[65vw] object-contain object-left sm:max-w-md lg:max-w-lg 2xl:max-w-2xl"
                        />
                    </a>

                    <p
                        class="mt-7 flex max-w-[min(100%,46rem)] flex-wrap items-center gap-y-1 text-xs font-normal text-white/50 sm:text-sm 2xl:mt-8 2xl:text-sm"
                    >
                        {#if activeAnime.audioLabel}
                            <span class="hero-metadata__tag">{activeAnime.audioLabel}</span>
                        {/if}
                        {#if activeAnime.genres.length}
                            <span class="hero-metadata__tag"
                                >{activeAnime.genres.slice(0, 4).join(', ')}</span
                            >
                        {/if}
                    </p>

                    {#if activeAnime.description}
                        <p
                            class="mt-3 line-clamp-4 max-w-[min(100%,46rem)] text-sm leading-6 text-[#bbb] sm:text-base 2xl:text-base 2xl:leading-7"
                        >
                            {activeAnime.description}
                        </p>
                    {/if}

                    <div
                        class="pointer-events-auto mt-7 flex flex-wrap items-center gap-2 text-xs font-bold text-accent sm:text-sm"
                    >
                        <a
                            href={activeAnime.link}
                            class="inline-flex h-10 items-center gap-2 bg-accent px-4 text-on-accent uppercase transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white 2xl:text-sm"
                        >
                            <PlayIcon size="1.2rem" weight="bold" aria-hidden="true" />
                            Start watching {activeAnime.episodeLabel}
                        </a>
                        <WatchlistBookmark
                            animeId={activeAnime.id}
                            title={activeAnime.title}
                            iconSize="1.35rem"
                            outlined
                        />
                    </div>

                    {#if highlights.length > 1}
                        <div
                            class="pointer-events-auto relative z-30 mt-6 flex items-center gap-2 2xl:mt-7"
                        >
                            {#each highlights as item, itemIndex (item.id)}
                                <button
                                    type="button"
                                    class={cn(
                                        'relative h-2 overflow-hidden rounded-full bg-white/50 transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                                        itemIndex === active
                                            ? 'w-12'
                                            : 'w-6 hover:bg-accent/60 focus-visible:bg-accent/60'
                                    )}
                                    aria-label={`Show ${item.title}`}
                                    aria-current={itemIndex === active ? 'true' : undefined}
                                    onclick={() => select(itemIndex, 'complete')}
                                >
                                    {#if itemIndex === active}
                                        {#key progression}
                                            <span
                                                class={cn(
                                                    'absolute inset-y-0 left-0 bg-accent',
                                                    autoRotate && progressMode === 'animated'
                                                        ? 'hero-pagination__progress'
                                                        : 'w-full'
                                                )}
                                                style:animation-duration={`${slideDuration}ms`}
                                                onanimationend={() => select(active + 1)}
                                            ></span>
                                        {/key}
                                    {/if}
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

        {#if highlights.length > 1}
            <button
                type="button"
                class="absolute top-[calc((100svh-3.5rem)/2)] left-2 z-30 grid size-11 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white sm:left-5"
                aria-label="Previous anime"
                onclick={() => select(active - 1, 'complete')}
            >
                <CaretLeftIcon size="1.7rem" weight="bold" aria-hidden="true" />
            </button>
            <button
                type="button"
                class="absolute top-[calc((100svh-3.5rem)/2)] right-2 z-30 grid size-11 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white sm:right-5"
                aria-label="Next anime"
                onclick={() => select(active + 1, 'complete')}
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

    .hero-pagination__progress {
        animation-name: hero-slide-progress;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
    }

    @keyframes hero-slide-progress {
        from {
            width: 0;
        }

        to {
            width: 100%;
        }
    }
</style>
