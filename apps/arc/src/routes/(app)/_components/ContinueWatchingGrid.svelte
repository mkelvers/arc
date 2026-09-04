<script lang="ts">
    import { enhance } from '$app/forms';
    import type { ContinueWatchingCard } from '@arc/core/browser';
    import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
    import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
    import XIcon from 'phosphor-svelte/lib/XIcon';
    import { Card, CardMedia } from '$lib/components/ui/card';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import Tooltip from '$lib/components/ui/Tooltip.svelte';
    import { m } from '$lib/i18n.svelte';

    interface Props {
        anime: ContinueWatchingCard[];
    }

    let { anime }: Props = $props();
    let removedAnimeIds = $state(new Set<number>());
    let visibleAnime = $derived(anime.filter((entry) => !removedAnimeIds.has(entry.animeId)));
    let rail = $state<HTMLDivElement>();
    let canScrollLeft = $state(false);
    let canScrollRight = $state(false);

    function updateScroll() {
        if (!rail) {
            return;
        }

        const hasOverflow = rail.scrollWidth > rail.clientWidth + 2;
        canScrollLeft = hasOverflow && rail.scrollLeft > 2;
        canScrollRight = hasOverflow && rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2;

        const firstCard = rail.firstElementChild;
        if (firstCard instanceof HTMLElement) {
            rail.parentElement?.style.setProperty('--rail-control-center', `${firstCard.clientWidth * 0.28}px`);
        }
    }

    function move(direction: -1 | 1) {
        if (!rail) {
            return;
        }

        const firstCard = rail.children[0];
        const secondCard = rail.children[1];
        const measuredPitch =
            firstCard instanceof HTMLElement && secondCard instanceof HTMLElement
                ? secondCard.offsetLeft - firstCard.offsetLeft
                : rail.clientWidth;
        const cardPitch = measuredPitch > 0 ? measuredPitch : rail.clientWidth;
        const cardsPerPage = Math.max(1, Math.floor(rail.clientWidth / cardPitch));

        rail.scrollBy({ left: direction * cardsPerPage * cardPitch, behavior: 'smooth' });
    }

    $effect(() => {
        const visibleAnimeCount = visibleAnime.length;

        if (!rail) {
            return;
        }

        if (!visibleAnimeCount) {
            canScrollLeft = false;
            canScrollRight = false;
            return;
        }

        updateScroll();
        const observer = new ResizeObserver(updateScroll);
        observer.observe(rail);

        return () => observer.disconnect();
    });
</script>

{#if visibleAnime.length}
    <section
        class="continue-watching-section relative z-20 col-start-1 row-start-2 row-end-3 self-end px-5 sm:px-10 lg:px-16 wide:row-start-1 wide:row-end-3 min-w-0"
        aria-labelledby="continue-watching"
    >
        <h2 id="continue-watching" class="mb-5 text-xl font-bold sm:text-2xl">{m.continue_watching()}</h2>

        <div class="relative [--rail-control-center:50%]">
            <div
                bind:this={rail}
                onscroll={updateScroll}
                class="scrollbar-hidden grid min-w-0 snap-x snap-mandatory grid-flow-col auto-cols-[calc((100vw-3.75rem)/1.35)] gap-3 overflow-x-auto overscroll-x-contain pb-4 scroll-smooth min-[30em]:auto-cols-[calc((100vw-4.75rem)/2.1)] min-[35.5em]:auto-cols-[calc((100vw-5.75rem)/2.7)] sm:auto-cols-[calc((100vw-8.75rem)/3.25)] sm:gap-4 lg:auto-cols-[calc((100vw-18.375rem)/4.25)] lg:gap-7.5 2xl:auto-cols-[calc((100vw-20.25rem)/5.25)]"
            >
                {#each visibleAnime as entry (entry.animeId)}
                    <div class="group relative min-w-0 snap-start">
                        <Card variant="compact" class="min-w-0 p-2">
                            <a
                                href={entry.link}
                                class="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                aria-label={`Continue watching ${entry.title}, ${entry.episodeLabel}`}
                            >
                                <CardMedia aspect="video">
                                    {@const progress = entry.progress
                                        ? entry.progress.completed
                                            ? 100
                                            : Math.min(
                                                  100,
                                                  Math.max(
                                                      0,
                                                      (entry.progress.positionSeconds /
                                                          entry.progress.durationSeconds) *
                                                          100
                                                  )
                                              )
                                        : 0}
                                    <ProgressiveImage
                                        src={entry.backdrop}
                                        alt=""
                                        previewSize="w300"
                                        class="absolute inset-0 transition-opacity duration-200 group-hover:opacity-0 group-focus-within:opacity-0"
                                    />
                                    <ProgressiveImage
                                        src={entry.episodeImage}
                                        alt=""
                                        class="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                                    />
                                    {#if entry.duration}
                                        <span
                                            class="absolute right-2 bottom-2 bg-black/85 px-1.5 py-0.5 text-xs font-semibold text-white transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
                                        >
                                            {entry.duration}
                                        </span>
                                    {/if}
                                    {#if entry.progress}
                                        <div
                                            class="absolute right-0 bottom-0 left-0 z-10 h-1 bg-black/60"
                                            role="progressbar"
                                            aria-label={`${entry.episodeLabel} progress`}
                                            aria-valuemin="0"
                                            aria-valuemax="100"
                                            aria-valuenow={Math.round(progress)}
                                        >
                                            <div class="h-full bg-accent" style:width={`${progress}%`}></div>
                                        </div>
                                    {/if}
                                </CardMedia>

                                <div class="flex min-h-24 flex-col pt-3">
                                    <h3 class="line-clamp-2 text-sm leading-snug font-semibold">
                                        {entry.title}
                                    </h3>
                                    <p class="mt-1.5 text-sm text-muted">
                                        {m.continue_watching_episode({ episode: entry.episodeLabel })}
                                    </p>
                                    {#if entry.audioLabel}
                                        <p class="mt-auto pt-5 text-sm text-muted">
                                            {entry.audioLabel}
                                        </p>
                                    {/if}
                                </div>
                            </a>
                        </Card>

                        <form
                            method="POST"
                            action="?/removeContinueWatching"
                            use:enhance={() => {
                                removedAnimeIds = new Set(removedAnimeIds).add(entry.animeId);

                                return async ({ update, result }) => {
                                    if (result.type === 'failure' || result.type === 'error') {
                                        const nextRemovedAnimeIds = new Set(removedAnimeIds);
                                        nextRemovedAnimeIds.delete(entry.animeId);
                                        removedAnimeIds = nextRemovedAnimeIds;
                                    }

                                    await update();
                                };
                            }}
                            class="absolute top-2 right-2 z-10 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
                        >
                            <input type="hidden" name="animeId" value={entry.animeId} />
                            <Tooltip text={m.remove()} escapeOverflow>
                                <button
                                    type="submit"
                                    class="grid size-8 place-items-center text-white/75 drop-shadow-sm transition-[color,transform] duration-150 hover:text-status-error focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-90"
                                    aria-label={m.remove_continue_watching({ title: entry.title })}
                                >
                                    <XIcon size="1rem" weight="bold" aria-hidden="true" />
                                </button>
                            </Tooltip>
                        </form>
                    </div>
                {/each}
            </div>

            {#if canScrollLeft}
                <button
                    type="button"
                    class="absolute top-(--rail-control-center) left-0 z-30 grid size-12 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white"
                    aria-label={`${m.continue_watching()}: ${m.shared_previous()}`}
                    onclick={() => move(-1)}
                >
                    <CaretLeftIcon size="1.65rem" weight="bold" aria-hidden="true" />
                </button>
            {/if}

            {#if canScrollRight}
                <button
                    type="button"
                    class="absolute top-(--rail-control-center) right-0 z-30 grid size-12 -translate-y-1/2 place-items-center text-white drop-shadow-lg transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-white"
                    aria-label={`${m.continue_watching()}: ${m.shared_next()}`}
                    onclick={() => move(1)}
                >
                    <CaretRightIcon size="1.65rem" weight="bold" aria-hidden="true" />
                </button>
            {/if}
        </div>
    </section>
{/if}
