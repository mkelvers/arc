<script lang="ts">
    import WatchPlayer from '$lib/components/WatchPlayer.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

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
