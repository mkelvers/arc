<script lang="ts">
    import type { ContinueWatchingCard } from '$lib/anime/types';

    interface Props {
        anime: ContinueWatchingCard[];
    }

    let { anime }: Props = $props();
</script>

{#if anime.length}
    <section
        class="px-5 pb-16 sm:px-10 sm:pb-18 lg:px-16 lg:pb-24"
        aria-labelledby="continue-watching"
    >
        <h2
            id="continue-watching"
            class="mb-5 text-xl font-bold sm:text-2xl"
        >
            Continue Watching
        </h2>

        <div class="-mx-2 grid grid-cols-1 gap-x-2 gap-y-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {#each anime as entry (entry.animeId)}
                <article
                    class="group min-w-0 p-2 transition-colors hover:bg-surface focus-within:bg-surface"
                >
                    <a
                        href={entry.watchHref}
                        class="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        aria-label={`Continue watching ${entry.title}, ${entry.episodeLabel}`}
                    >
                        <div class="relative aspect-video overflow-hidden bg-surface">
                            <img
                                src={entry.backdrop}
                                alt=""
                                class="absolute inset-0 size-full object-cover transition-opacity duration-200 group-hover:opacity-0 group-focus-within:opacity-0"
                                loading="lazy"
                            />
                            <img
                                src={entry.episodeImage}
                                alt=""
                                class="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
                                loading="lazy"
                            />
                            {#if entry.duration}
                                <span
                                    class="absolute right-2 bottom-2 bg-black/85 px-1.5 py-0.5 text-xs font-semibold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
                                >
                                    {entry.duration}
                                </span>
                            {/if}
                        </div>

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
                </article>
            {/each}
        </div>
    </section>
{/if}
