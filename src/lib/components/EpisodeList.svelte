<script lang="ts">
    import { formatAudioLabel, type AnimeEpisode } from '$lib/anime';
    import { CalendarBlankIcon, PlayIcon } from 'phosphor-svelte';

    interface Props {
        episodes?: AnimeEpisode[];
        title: string;
        image?: string | null;
    }

    let {
        episodes = [],
        title,
        image = null,
    }: Props = $props();
</script>

<section id="anime-episode-list" class="py-7 sm:pb-12 lg:pb-16">
    {#if episodes.length}
        <div class="grid grid-cols-1 gap-x-5 gap-y-8 md:grid-cols-5 2xl:grid-cols-7">
            {#each episodes as episode}
                <a
                    href={episode.href}
                    class="group relative block min-h-56 min-w-0 focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none"
                >
                    <div class="transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0">
                        <div class="relative aspect-video overflow-hidden bg-surface">
                            {#if episode.imageUrl || image}
                                <img
                                    src={episode.imageUrl ?? image ?? ''}
                                    alt=""
                                    class="size-full object-cover brightness-75"
                                    loading="lazy"
                                />
                            {/if}
                            {#if episode.duration}
                                <span class="absolute right-2 bottom-2 bg-black/75 px-1.5 py-0.5 text-xs font-bold text-white">
                                    {episode.duration}
                                </span>
                            {/if}
                        </div>

                        <div class="mt-3 min-w-0">
                            <p class="line-clamp-1 text-xs font-medium text-subtle uppercase">
                                {title}
                            </p>
                            <h3 class="mt-1 line-clamp-2 text-sm leading-snug font-bold text-foreground">
                                {episode.label} - {episode.title}
                            </h3>
                            <p class="mt-3 text-sm text-muted">{formatAudioLabel(episode.audio)}</p>
                        </div>
                    </div>

                    <div class="pointer-events-none absolute inset-0 z-10 flex flex-col bg-surface p-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                        <p class="line-clamp-1 text-xs font-medium text-subtle uppercase">
                            {title}
                        </p>
                        <h3 class="mt-2 line-clamp-2 text-sm leading-snug font-bold text-foreground">
                            {episode.label} - {episode.title}
                        </h3>
                        {#if episode.airDate}
                            <div class="mt-1 flex items-center gap-1.5 text-xs text-muted">
                                <CalendarBlankIcon size="0.875rem" aria-hidden="true" />
                                <span>{episode.airDate}</span>
                            </div>
                        {/if}
                        {#if episode.overview}
                            <p class="mt-2 line-clamp-6 text-xs leading-4 text-foreground">
                                {episode.overview}
                            </p>
                        {/if}
                        <span class="mt-auto inline-flex items-center gap-2 pt-3 text-xs font-bold text-accent uppercase">
                            <PlayIcon size="1.25rem" weight="bold" aria-hidden="true" />
                            Play {episode.label}
                        </span>
                    </div>
                </a>
            {/each}
        </div>
    {:else}
        <p class="text-sm text-muted">No available episodes found yet.</p>
    {/if}
</section>
