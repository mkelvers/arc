<script lang="ts">
    import type { AnimeEpisode } from '$lib/anime/episodes';

    interface Props {
        episode: AnimeEpisode;
        fallbackImage?: string | null;
    }

    let { episode, fallbackImage = null }: Props = $props();
</script>

<a
    href={episode.href}
    class="group grid grid-cols-[minmax(8.5rem,9.25rem)_minmax(0,1fr)] gap-3 focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-white"
>
    <div class="relative aspect-video overflow-hidden bg-[#171717]">
        {#if episode.imageUrl || fallbackImage}
            <img
                src={episode.imageUrl ?? fallbackImage ?? ''}
                alt=""
                class="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
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
        <p class="mt-1.5 text-sm text-[#969696]">{episode.audioLabel}</p>
    </div>
</a>
