<script lang="ts">
    import { ArchiveIcon } from 'phosphor-svelte';

    import { audioAvailabilityLabel } from '$lib/anime/audio';
    import EpisodeDialog from '$lib/components/EpisodeDialog.svelte';
    import EpisodeGridCard from '$lib/components/EpisodeGridCard.svelte';
    import ProgressiveImage from '$lib/components/ProgressiveImage.svelte';
    import WatchPlayer from '$lib/components/WatchPlayer.svelte';
    import { availableModes } from '$lib/player/media';
    import type { PageProps } from './$types';

    function releaseDate(value: string) {
        const parts = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        const date = parts
            ? new Date(Date.UTC(Number(parts[3]), Number(parts[1]) - 1, Number(parts[2])))
            : new Date(`${value}T00:00:00Z`);

        return Number.isNaN(date.valueOf())
            ? value
            : new Intl.DateTimeFormat('en', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'UTC',
              }).format(date);
    }

    let { data }: PageProps = $props();
    let episodeDialogOpen = $state(false);
    let renderedEpisodeId: string | undefined;

    const movie = $derived(data.anime.format === 'Movie');
    const heading = $derived(
        movie
            ? data.anime.title
            : data.currentEpisode.title
              ? `${data.currentEpisode.label} – ${data.currentEpisode.title}`
              : data.currentEpisode.label
    );

    $effect(() => {
        if (renderedEpisodeId === undefined) {
            renderedEpisodeId = data.currentEpisode.id;
            return;
        }
        if (renderedEpisodeId === data.currentEpisode.id) {
            return;
        }

        renderedEpisodeId = data.currentEpisode.id;
        episodeDialogOpen = false;
    });
</script>

<main class="min-h-dvh">
    <WatchPlayer
        playback={data.playback}
        animeId={data.anime.id}
        episodeId={data.currentEpisode.id}
        episodeNumber={data.currentEpisode.number}
        label={heading}
        poster={data.currentEpisode.image ?? data.fallbackImage}
        next={data.nextEpisode?.href}
        startAt={data.startAt}
        progressEventAt={data.progressEventAt}
        segments={data.segments}
    />

    <div class="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-11 sm:px-8 lg:flex-row lg:px-0 lg:py-12">
        {#if movie && data.poster}
            <a
                href={`/anime/${data.anime.id}`}
                aria-label={`View ${data.anime.title}`}
                class="group mx-auto aspect-2/3 w-48 shrink-0 overflow-hidden bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:mx-0 lg:w-56"
            >
                <div class="relative size-full">
                    <ProgressiveImage
                        src={data.poster}
                        alt=""
                        loading="eager"
                        imageClass="transition-[filter] duration-150 group-hover:brightness-50 group-focus-visible:brightness-50"
                    />
                    <span
                        class="pointer-events-none absolute inset-0 grid place-items-center bg-black/20 text-sm font-bold text-white uppercase opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                    >
                        To series
                    </span>
                </div>
            </a>
        {/if}

        <article class="min-w-0 flex-1">
            <a href={`/anime/${data.anime.id}`} class="text-sm font-bold text-accent hover:underline">
                {data.anime.title}
            </a>
            <h1 class="mt-4 text-xl leading-tight font-bold">
                {heading}
            </h1>

            <p class="mt-3 text-sm text-watch-muted">
                {#await data.playback}
                    {audioAvailabilityLabel(data.currentEpisode.audio)}
                {:then playback}
                    {@const modes = availableModes(playback.streams)}
                    {audioAvailabilityLabel(modes.length ? modes : data.currentEpisode.audio)}
                {/await}
                {#if data.currentEpisode.duration}
                    <span aria-hidden="true">{' · '}</span>
                    {data.currentEpisode.duration}
                {/if}
            </p>
            {#if data.currentEpisode.releaseDate}
                <p class="mt-2 text-sm text-watch-secondary">
                    Released on {releaseDate(data.currentEpisode.releaseDate)}
                </p>
            {/if}

            {#if data.currentEpisode.overview}
                <p class="mt-5 max-w-4xl text-base leading-6 text-watch-primary">
                    {data.currentEpisode.overview}
                </p>
            {/if}
        </article>

        {#if !movie}
            <aside class="space-y-7 lg:w-72 lg:shrink-0">
                {#if data.nextEpisode}
                    <section>
                        <h2 class="mb-3 text-xs font-bold uppercase">Next episode</h2>
                        <EpisodeGridCard
                            context="watch"
                            title={data.anime.title}
                            episode={data.nextEpisode}
                            image={data.fallbackImage}
                        />
                    </section>
                {/if}

                {#if data.previousEpisode}
                    <section>
                        <h2 class="mb-3 text-xs font-bold uppercase">Previous episode</h2>
                        <EpisodeGridCard
                            context="watch"
                            title={data.anime.title}
                            episode={data.previousEpisode}
                            image={data.fallbackImage}
                        />
                    </section>
                {/if}

                <button
                    type="button"
                    class="flex min-h-10 w-fit items-center gap-2.5 border-2 border-watch-secondary px-4 text-xs font-bold text-watch-primary uppercase hover:border-white hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    aria-haspopup="dialog"
                    onclick={() => (episodeDialogOpen = true)}
                >
                    <ArchiveIcon size="1.6rem" weight="bold" aria-hidden="true" />
                    See more episodes
                </button>
            </aside>
        {/if}
    </div>
</main>

<EpisodeDialog
    open={episodeDialogOpen}
    title={data.anime.title}
    episodes={data.episodes}
    currentId={data.currentEpisode.id}
    image={data.fallbackImage}
    onclose={() => (episodeDialogOpen = false)}
/>
