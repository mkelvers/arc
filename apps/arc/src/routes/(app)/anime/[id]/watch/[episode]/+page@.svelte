<script lang="ts">
    import WatchPlayer from '$lib/components/WatchPlayer.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <title>
        Arc — Watch {data.anime.title}{data.anime.format === 'Movie'
            ? ''
            : ` — ${data.currentEpisode.title ? `${data.currentEpisode.label} – ${data.currentEpisode.title}` : data.currentEpisode.label}`}
    </title>
    <meta name="description" content={`Watch ${data.anime.title} on Arc.`} />
</svelte:head>

<main class="fixed inset-0 size-full overflow-hidden bg-black select-none">
    <WatchPlayer
        anime={data.anime}
        logo={data.logo}
        currentEpisode={data.currentEpisode}
        episodes={data.episodes}
        previousEpisode={data.previousEpisode}
        nextEpisode={data.nextEpisode}
        fallbackImage={data.fallbackImage}
        playback={data.playback}
        poster={data.currentEpisode.image ?? data.fallbackImage}
        startAt={data.startAt}
        progressEventAt={data.progressEventAt}
        segments={data.segments}
    />
</main>
