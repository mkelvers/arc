<script lang="ts">
    import { audioAvailabilityLabel } from '$lib/anime/audio';
    import type { AnimeEpisode } from '$lib/anime/types';

    interface Props {
        episode: AnimeEpisode;
        image?: string | null;
    }

    let { episode, image = null }: Props = $props();
</script>

<a
    href={episode.href}
    class="group flex gap-3 focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-white"
>
    <div class="relative aspect-video w-36 shrink-0 overflow-hidden bg-media-tile">
        {#if episode.image || image}
            <img
                src={episode.image ?? image ?? ''}
                alt=""
                class="size-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
        {/if}
        {#if episode.duration}
            <span class="absolute right-1.5 bottom-1.5 bg-black/75 px-1.5 py-0.5 text-sm font-bold text-white">
                {episode.duration}
            </span>
        {/if}
    </div>
    <div class="min-w-0 self-center">
        <h3 class="line-clamp-3 text-sm leading-snug font-bold text-white">
            {episode.label} – {episode.title}
        </h3>
        <p class="mt-1.5 text-sm text-watch-muted">{audioAvailabilityLabel(episode.audio)}</p>
    </div>
</a>
