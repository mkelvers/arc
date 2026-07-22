<script lang="ts">
    import EpisodeDialog from '$lib/components/EpisodeDialog.svelte';
    import VideoPlayer from '$lib/components/VideoPlayer.svelte';
    import WatchEpisodeCard from '$lib/components/WatchEpisodeCard.svelte';
    import type { PageProps } from './$types';
    import {
        ArchiveIcon,
        BookmarkSimpleIcon,
        ShareNetworkIcon,
        ThumbsDownIcon,
        ThumbsUpIcon,
    } from 'phosphor-svelte';

    let { data }: PageProps = $props();
    let episodeDialogOpen = $state(false);
    let renderedEpisodeId = $state<string>();

    const poster = $derived(
        data.currentEpisode.imageUrl ?? data.fallbackImage,
    );

    $effect(() => {
        if (renderedEpisodeId === undefined) {
            renderedEpisodeId = data.currentEpisode.id;
            return;
        }
        if (renderedEpisodeId === data.currentEpisode.id) return;

        renderedEpisodeId = data.currentEpisode.id;
        episodeDialogOpen = false;
    });

    function releaseDate(value: string) {
        if (!value) return '';

        const parts = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        const date = parts
            ? new Date(Date.UTC(Number(parts[3]), Number(parts[1]) - 1, Number(parts[2])))
            : new Date(`${value}T00:00:00Z`);
        if (Number.isNaN(date.valueOf())) return value;

        return new Intl.DateTimeFormat('en', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
        }).format(date);
    }

    async function share() {
        const shareData = {
            title: `${data.currentEpisode.label} – ${data.currentEpisode.title}`,
            url: window.location.href,
        };

        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            await navigator.clipboard.writeText(shareData.url);
        }
    }
</script>

<svelte:head>
    <title>{data.currentEpisode.label} – {data.currentEpisode.title} — Arc</title>
</svelte:head>

<main class="min-h-dvh">
    {#key `${data.currentEpisode.id}:${JSON.stringify(data.streams)}`}
        {#if data.streams.sub || data.streams.dub}
            <VideoPlayer
                sources={data.streams}
                label={`${data.currentEpisode.label} – ${data.currentEpisode.title}`}
                {poster}
                next={data.nextEpisode?.href}
            />
        {:else}
            <section
                aria-label={`${data.currentEpisode.label} – ${data.currentEpisode.title} player`}
                class="relative aspect-video w-full overflow-hidden bg-black"
            >
                {#if poster}
                    <img src={poster} alt="" class="size-full object-cover object-center" />
                    <div class="pointer-events-none absolute inset-0 bg-black/50"></div>
                {/if}
            </section>
        {/if}
    {/key}

    <div class="mx-auto grid w-full max-w-5xl gap-12 px-6 py-11 sm:px-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12 lg:px-0 lg:py-12">
        <article class="min-w-0">
            <div class="flex items-start gap-6">
                <div class="min-w-0 flex-1">
                    <a
                        href={`/anime/${data.anime.id}`}
                        class="text-sm font-bold text-accent hover:underline"
                    >
                        {data.anime.title}
                    </a>
                    <h1 class="mt-4 text-xl leading-tight font-bold">
                        {data.currentEpisode.label} – {data.currentEpisode.title}
                    </h1>
                </div>
                <button
                    type="button"
                    class="grid size-11 shrink-0 place-items-center text-[#dadada] hover:bg-white/8 focus-visible:outline-1 focus-visible:outline-white"
                    aria-label="Bookmark episode"
                >
                    <BookmarkSimpleIcon size="1.75rem" aria-hidden="true" />
                </button>
            </div>

            <p class="mt-3 text-sm text-[#969696]">
                {data.currentEpisode.audioLabel}
                {#if data.currentEpisode.duration}
                    <span aria-hidden="true"> · </span>
                    {data.currentEpisode.duration}
                {/if}
            </p>
            {#if data.currentEpisode.airDate}
                <p class="mt-2 text-sm text-[#b8b8b8]">
                    Released on {releaseDate(data.currentEpisode.airDate)}
                </p>
            {/if}

            <div class="mt-3 flex items-center gap-7 text-sm text-[#aaa]">
                <button type="button" class="inline-flex min-h-11 items-center gap-2 hover:text-white" aria-label="Like episode">
                    <ThumbsUpIcon size="1.6rem" aria-hidden="true" />
                </button>
                <button type="button" class="inline-flex min-h-11 items-center gap-2 hover:text-white" aria-label="Dislike episode">
                    <ThumbsDownIcon size="1.6rem" aria-hidden="true" />
                </button>
                <button
                    type="button"
                    class="ml-auto grid size-11 place-items-center text-[#b8b8b8] hover:bg-white/8 hover:text-white focus-visible:outline-1 focus-visible:outline-white"
                    aria-label="Share episode"
                    onclick={share}
                >
                    <ShareNetworkIcon size="1.6rem" aria-hidden="true" />
                </button>
            </div>

            {#if data.currentEpisode.overview}
                <p class="mt-5 max-w-4xl text-base leading-6 text-[#e1e1e1]">
                    {data.currentEpisode.overview}
                </p>
            {/if}
        </article>

        <aside class="space-y-7">
            {#if data.nextEpisode}
                <section>
                    <h2 class="mb-3 text-xs font-bold uppercase">Next episode</h2>
                    <WatchEpisodeCard
                        episode={data.nextEpisode}
                        image={data.fallbackImage}
                    />
                </section>
            {/if}

            {#if data.previousEpisode}
                <section>
                    <h2 class="mb-3 text-xs font-bold uppercase">Previous episode</h2>
                    <WatchEpisodeCard
                        episode={data.previousEpisode}
                        image={data.fallbackImage}
                    />
                </section>
            {/if}

            <button
                type="button"
                class="flex min-h-10 w-fit items-center gap-2.5 border-2 border-[#bcbcbc] px-4 text-xs font-bold text-[#d8d8d8] uppercase hover:border-white hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                aria-haspopup="dialog"
                onclick={() => (episodeDialogOpen = true)}
            >
                <ArchiveIcon size="1.6rem" weight="bold" aria-hidden="true" />
                See more episodes
            </button>
        </aside>
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
