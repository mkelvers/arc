<script lang="ts">
    import { enhance } from '$app/forms';
    import type { ContinueWatchingCard } from '@arc/core/client';
    import XIcon from 'phosphor-svelte/lib/XIcon';
    import Card from '$lib/components/ui/card/Card.svelte';
    import CardMedia from '$lib/components/ui/card/CardMedia.svelte';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import Button from '$lib/components/ui/button/button.svelte';
    import Input from '$lib/components/ui/input/Input.svelte';
    import Carousel from '$lib/components/ui/Carousel.svelte';
    import Tooltip from '$lib/components/ui/Tooltip.svelte';
    import { m } from '$lib/i18n.svelte';

    interface Props {
        anime: ContinueWatchingCard[];
    }

    let { anime }: Props = $props();
    let removed = $state(new Set<number>());
    let entries = $derived(anime.filter((entry) => !removed.has(entry.animeId)));
</script>

{#if entries.length}
    <section
        class="continue-watching-section relative z-20 col-start-1 row-start-2 row-end-3 self-end px-5 sm:px-10 lg:px-16 wide:row-start-1 wide:row-end-3 min-w-0"
        aria-labelledby="continue-watching"
    >
        <h2 id="continue-watching" class="mb-5 text-xl font-bold sm:text-2xl">{m.continue_watching()}</h2>

        <Carousel controls class="min-w-0">
            {#snippet children({})}
                <div class="scrollbar-hidden flex min-w-0 gap-3 overscroll-x-contain pb-4 sm:gap-4 lg:gap-7.5">
                    {#each entries as entry (entry.animeId)}
                        <div
                            class="group relative min-w-0 shrink-0 grow-0 basis-[calc((100vw-3.75rem)/1.35)] min-[30em]:basis-[calc((100vw-4.75rem)/2.1)] min-[35.5em]:basis-[calc((100vw-5.75rem)/2.7)] sm:basis-[calc((100vw-8.75rem)/3.25)] lg:basis-[calc((100vw-18.375rem)/4.25)] 2xl:basis-[calc((100vw-20.25rem)/5.25)]"
                        >
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
                                            class="absolute inset-0 transition-opacity duration-200 group-hover:opacity-0 group-focus-within:opacity-0"
                                        ></ProgressiveImage>
                                        <ProgressiveImage
                                            src={entry.episodeImage}
                                            alt=""
                                            class="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                                        ></ProgressiveImage>
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
                                    removed = new Set(removed).add(entry.animeId);

                                    return async ({ update, result }) => {
                                        if (result.type === 'failure' || result.type === 'error') {
                                            const nextRemoved = new Set(removed);
                                            nextRemoved.delete(entry.animeId);
                                            removed = nextRemoved;
                                        }

                                        await update();
                                    };
                                }}
                                class="absolute top-2 right-2 z-10 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
                            >
                                <Input type="hidden" name="animeId" value={entry.animeId}></Input>
                                <Tooltip text={m.remove()} escapeOverflow>
                                    <Button
                                        variant="unstyled"
                                        type="submit"
                                        class="grid size-8 place-items-center text-white/75 drop-shadow-sm transition-[color,transform] duration-150 hover:text-status-error focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-90"
                                        aria-label={m.remove_continue_watching({ title: entry.title })}
                                    >
                                        <XIcon size="1rem" weight="bold" aria-hidden="true"></XIcon>
                                    </Button>
                                </Tooltip>
                            </form>
                        </div>
                    {/each}
                </div>
            {/snippet}
        </Carousel>
    </section>
{/if}
