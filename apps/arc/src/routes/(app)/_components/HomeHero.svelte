<script lang="ts">
    import { prefersReducedMotion } from 'svelte/motion';
    import { CaretLeftIcon, CaretRightIcon, PlayIcon } from 'phosphor-svelte';
    import { cn } from '$lib/utils';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
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
    let carousel = $state({
        active: 0,
        previous: null as number | null,
        progression: 0,
        progressMode: 'animated' as ProgressMode,
    });
    let ready = $state({
        backdrops: new Set<number>(),
        logos: new Set<number>(),
    });
    const activeAnime = $derived(highlights[carousel.active]);
    const autoRotate = $derived(highlights.length > 1 && !prefersReducedMotion.current);
    const upcoming = $derived((carousel.active + 1) % highlights.length);

    function select(index: number, mode: ProgressMode = 'animated') {
        if (!highlights.length) {
            return;
        }

        const selected = (index + highlights.length) % highlights.length;
        carousel.previous = selected === carousel.active || prefersReducedMotion.current ? null : carousel.active;
        carousel.active = selected;
        carousel.progressMode = mode;
        carousel.progression += 1;
    }

    $effect(() => {
        if (!autoRotate || carousel.progressMode !== 'complete') {
            return;
        }

        const timeout = window.setTimeout(() => select(carousel.active + 1), 15_000);

        return () => window.clearTimeout(timeout);
    });
</script>

{#if highlights.length}
    <section
        class="relative h-[min(100svh,32rem)] min-h-0 max-h-none overflow-hidden bg-black sm:h-[min(100svh,42rem)] sm:min-h-180 sm:max-h-192 xl:h-[calc(100svh-3.5rem)] xl:max-h-none"
        aria-roledescription="carousel"
        aria-label="Trending anime now"
    >
        {#if activeAnime}
            <article class="home-hero-slide absolute inset-0 grid grid-cols-1 grid-rows-1 overflow-hidden">
                <a
                    href={activeAnime.href}
                    class="col-start-1 row-start-1 grid focus-visible:outline-2 focus-visible:outline-white"
                    aria-label={`View ${activeAnime.title}`}
                >
                    {#each highlights as anime, index (anime.id)}
                        <ProgressiveImage
                            src={anime.image}
                            alt={index === carousel.active ? anime.title : ''}
                            previewSize="w300"
                            class={cn(
                                'col-start-1 row-start-1 transition-opacity duration-500 ease-out motion-reduce:transition-none',
                                index === carousel.active ? 'opacity-100' : 'opacity-0'
                            )}
                            imageClass="object-top"
                            previewLoading="eager"
                            loading="eager"
                            fetchpriority={index === carousel.active ? 'high' : 'low'}
                            loadFull={index === carousel.active ||
                                index === carousel.previous ||
                                index === upcoming}
                            onready={() => {
                                ready.backdrops = new Set(ready.backdrops).add(anime.id);
                            }}
                            ontransitionend={(event) => {
                                if (event.propertyName === 'opacity' && index === carousel.previous) {
                                    carousel.previous = null;
                                }
                            }}
                        />
                    {/each}
                </a>

                <div
                    class="pointer-events-none z-30 col-start-1 row-start-1 min-w-0 self-end pb-8 sm:pb-80 xl:h-[32rem] xl:self-center xl:pb-0"
                >
                    <div class="relative">
                        <div class="px-5 sm:px-10 lg:px-16">
                            <div
                                class="relative h-24 w-[min(100%,20rem)] sm:h-28 sm:w-[min(100%,32rem)] lg:h-48 xl:w-fit"
                            >
                                <a
                                    href={activeAnime.href}
                                    class="pointer-events-auto relative z-10 flex h-full w-full items-center justify-start px-10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white xl:block xl:h-auto xl:w-fit xl:px-0"
                                    aria-label={`View ${activeAnime.title}`}
                                >
                                    {#each highlights as anime, index (anime.id)}
                                        {#if index === carousel.active || index === upcoming}
                                            <img
                                                src={anime.logo.url}
                                                alt={index === carousel.active ? anime.title : ''}
                                                aria-hidden={index !== carousel.active}
                                                loading="eager"
                                                fetchpriority={index === carousel.active ? 'high' : 'low'}
                                                style:height={`clamp(${(5 * anime.logo.size) / 100}rem, ${(6.4 * anime.logo.size) / 100}vw, ${(8 * anime.logo.size) / 100}rem)`}
                                                class={cn(
                                                    'max-h-24 max-w-[calc(100%_-_5rem)] object-contain object-left sm:max-h-28 sm:max-w-sm lg:max-h-48 lg:max-w-lg 2xl:max-w-2xl',
                                                    index === carousel.active
                                                        ? 'block'
                                                        : 'absolute inset-0 opacity-0',
                                                    index === carousel.active &&
                                                        ready.backdrops.has(anime.id) &&
                                                        ready.logos.has(anime.id)
                                                        ? 'opacity-100'
                                                        : 'opacity-0'
                                                )}
                                                onload={() => {
                                                    ready.logos = new Set(ready.logos).add(anime.id);
                                                }}
                                            />
                                        {/if}
                                    {/each}
                                </a>

                                <button
                                    type="button"
                                    class="pointer-events-auto absolute top-1/2 left-0 z-30 grid size-9 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white lg:size-11 xl:inset-y-0 xl:top-auto xl:right-full xl:left-auto xl:my-auto xl:mr-2 xl:translate-y-0"
                                    aria-label="Previous anime"
                                    onclick={() => select(carousel.active - 1, 'complete')}
                                >
                                    <CaretLeftIcon
                                        size="1.45rem"
                                        weight="bold"
                                        aria-hidden="true"
                                        class="lg:size-[1.7rem]"
                                    />
                                </button>
                            </div>
                        </div>

                        {#if highlights.length > 1}
                            <button
                                type="button"
                                class="pointer-events-auto absolute top-1/2 right-0 z-30 grid size-9 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white lg:size-11 xl:inset-y-0 xl:top-auto xl:my-auto xl:translate-y-0"
                                aria-label="Next anime"
                                onclick={() => select(carousel.active + 1, 'complete')}
                            >
                                <CaretRightIcon
                                    size="1.45rem"
                                    weight="bold"
                                    aria-hidden="true"
                                    class="lg:size-[1.7rem]"
                                />
                            </button>
                        {/if}
                    </div>

                    <p
                        class="mt-5 flex min-h-5 max-w-[min(100%,36rem)] flex-wrap items-center gap-y-1 px-5 text-xs font-normal text-white/50 sm:min-h-0 sm:px-10 lg:mt-7 lg:max-w-[min(100%,46rem)] lg:px-16 lg:text-sm 2xl:mt-8"
                    >
                        {#if activeAnime.audioLabel}
                            <span class="hero-metadata__tag">{activeAnime.audioLabel}</span>
                        {/if}
                        {#if activeAnime.genres.length}
                            <span class="hero-metadata__tag">
                                {activeAnime.genres.slice(0, 4).join(', ')}
                            </span>
                        {/if}
                    </p>

                    <p
                        class="mt-2 min-h-15 line-clamp-3 max-w-[min(100%,36rem)] px-5 text-xs leading-5 text-[#bbb] sm:min-h-0 sm:px-10 lg:mt-3 lg:line-clamp-4 lg:max-w-[min(100%,46rem)] lg:px-16 lg:text-base lg:leading-6 2xl:leading-7"
                    >
                        {activeAnime.description}
                    </p>

                    <div
                        class="pointer-events-auto mt-5 flex flex-wrap items-center gap-2 px-5 text-xs font-bold text-accent sm:px-10 lg:mt-7 lg:px-16 lg:text-sm"
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
                            class="pointer-events-auto relative z-30 mt-6 flex items-center gap-2 px-5 2xl:mt-7 sm:px-10 lg:px-16"
                        >
                            {#each highlights as item, itemIndex (item.id)}
                                <button
                                    type="button"
                                    class={cn(
                                        'relative h-2 overflow-hidden rounded-full bg-white/50 transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                                        itemIndex === carousel.active
                                            ? 'w-12'
                                            : 'w-6 hover:bg-accent/60 focus-visible:bg-accent/60'
                                    )}
                                    aria-label={`Show ${item.title}`}
                                    aria-current={itemIndex === carousel.active ? 'true' : undefined}
                                    onclick={() => select(itemIndex, 'complete')}
                                >
                                    {#if itemIndex === carousel.active}
                                        {#key carousel.progression}
                                            <span
                                                class={cn(
                                                    'absolute inset-y-0 left-0 bg-accent',
                                                    autoRotate && carousel.progressMode === 'animated'
                                                        ? 'hero-pagination__progress'
                                                        : 'w-full'
                                                )}
                                                style:animation-duration="15s"
                                                onanimationend={() => select(carousel.active + 1)}
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
