<script lang="ts">
    import { enhance } from '$app/forms';
    import { XIcon } from 'phosphor-svelte';
    import type { ContinueWatchingCard } from '@arc/shared/types';
    import Card from '$lib/components/ui/card/Card.svelte';
    import CardMedia from '$lib/components/ui/card/CardMedia.svelte';
    import ProgressiveImage from '$lib/components/ui/ProgressiveImage.svelte';
    import Tooltip from '$lib/components/ui/Tooltip.svelte';

    interface Props {
        anime: ContinueWatchingCard[];
    }

    let { anime }: Props = $props();
</script>

{#if anime.length}
    <section
        class="continue-watching-section relative z-20 col-start-1 row-start-2 row-end-3 self-end px-5 sm:px-10 lg:px-16 wide:row-start-1 wide:row-end-3"
        aria-labelledby="continue-watching"
    >
        <h2 id="continue-watching" class="mb-5 text-xl font-bold sm:text-2xl">Continue Watching</h2>

        <div
            class="grid grid-cols-1 gap-x-2 gap-y-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
        >
            {#each anime as entry (entry.animeId)}
                <Card variant="compact" class="p-2">
                    <a
                        href={entry.link}
                        class="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        aria-label={`Continue watching ${entry.title}, ${entry.episodeLabel}`}
                    >
                        <CardMedia aspect="video">
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
                        </CardMedia>

                        <div class="flex min-h-24 flex-col pt-3">
                            <h3 class="line-clamp-2 text-sm leading-snug font-semibold">
                                {entry.title}
                            </h3>
                            <p class="mt-1.5 text-sm text-muted">
                                Continue Watching: {entry.episodeLabel}
                            </p>
                            {#if entry.audioLabel}
                                <p class="mt-auto pt-5 text-sm text-muted">
                                    {entry.audioLabel}
                                </p>
                            {/if}
                        </div>
                    </a>

                    <form
                        method="POST"
                        action="?/removeContinueWatching"
                        use:enhance
                        class="absolute top-2 right-2 z-10 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                        <input type="hidden" name="animeId" value={entry.animeId} />
                        <Tooltip text="Remove">
                            <button
                                type="submit"
                                class="grid size-8 place-items-center text-white/75 drop-shadow-sm transition-colors hover:text-status-error focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                aria-label={`Remove ${entry.title} from continue watching`}
                            >
                                <XIcon size="1rem" weight="bold" aria-hidden="true" />
                            </button>
                        </Tooltip>
                    </form>
                </Card>
            {/each}
        </div>
    </section>
{/if}
