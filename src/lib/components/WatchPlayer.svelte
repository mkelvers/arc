<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import { hasStreams, type Sources } from '$lib/player/media';
    import { SpinnerGapIcon } from 'phosphor-svelte';
    import VideoPlayer from './VideoPlayer.svelte';

    interface Playback {
        streams: Sources;
        streamError: boolean;
    }

    interface Props {
        animeId: number;
        episodeId: string;
        episodeNumber: number;
        label: string;
        next?: string | null;
        playback: Promise<Playback>;
        poster?: string | null;
        startAt?: number;
    }

    let {
        animeId,
        episodeId,
        episodeNumber,
        label,
        next = null,
        playback,
        poster = null,
        startAt = 0,
    }: Props = $props();
    let retrying = $state(false);

    async function retry() {
        retrying = true;

        try {
            await invalidateAll();
        } finally {
            retrying = false;
        }
    }
</script>

{#await playback}
    <section
        aria-label={`${label} player`}
        aria-busy="true"
        class="relative grid aspect-video w-full place-items-center overflow-hidden bg-black px-6 text-center"
    >
        {#if poster}
            <img
                src={poster}
                alt=""
                class="absolute inset-0 size-full scale-105 object-cover opacity-35 blur-xl"
            />
        {/if}
        <SpinnerGapIcon
            role="status"
            aria-label="Loading video"
            size="2.5rem"
            weight="bold"
            class="relative animate-spin text-accent"
        />
    </section>
{:then result}
    {#key `${episodeId}:${JSON.stringify(result.streams)}`}
        {#if hasStreams(result.streams)}
            <VideoPlayer
                {animeId}
                {episodeId}
                {episodeNumber}
                sources={result.streams}
                {label}
                {poster}
                {next}
                {startAt}
            />
        {:else}
            <section
                aria-label={`${label} player`}
                role="alert"
                class="grid aspect-video w-full place-items-center bg-black px-6 text-center"
            >
                <div>
                    <p class="text-base font-bold">
                        {result.streamError
                            ? 'The streaming providers could not load this video.'
                            : 'No video source is available.'}
                    </p>
                    <p class="mt-2 text-sm text-white/65">
                        Arc tried every available source for this episode.
                    </p>
                    <button
                        type="button"
                        disabled={retrying}
                        class="mt-5 min-h-11 border border-white/60 px-5 text-sm font-bold hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-60"
                        onclick={retry}
                    >
                        {retrying ? 'Trying again…' : 'Try again'}
                    </button>
                </div>
            </section>
        {/if}
    {/key}
{/await}
