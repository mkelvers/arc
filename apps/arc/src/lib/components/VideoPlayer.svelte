<script lang="ts">
    import type { AnimeEpisode } from '$lib/types';
    import EpisodeDialog from './EpisodeDialog.svelte';
    import { Player } from '$lib/player/controller.svelte';
    import { subtitleBackgrounds, subtitleSizes, subtitleTextColors, type Sources } from '$lib/player/media';
    import type { EpisodeSkipTimes, SegmentTemplates } from '$lib/player/skip-times';
    import { onMount, untrack } from 'svelte';
    import { CaretLeftIcon, SpinnerGapIcon } from 'phosphor-svelte';
    import Controls from './player/Controls.svelte';

    interface AnimeInfo {
        id: number;
        title: string;
        format?: string | null;
    }

    interface LogoInfo {
        url: string;
        size: number;
    }

    interface Props {
        anime: AnimeInfo;
        logo?: LogoInfo | null;
        currentEpisode: AnimeEpisode;
        episodes: AnimeEpisode[];
        previousEpisode?: AnimeEpisode | null;
        nextEpisode?: AnimeEpisode | null;
        fallbackImage?: string | null;
        sources: Sources;
        poster?: string | null;
        next?: string | null;
        onretry: () => void;
        startAt?: number;
        progressEventAt: number;
        segments: {
            canEdit: boolean;
            times: EpisodeSkipTimes;
            templates: SegmentTemplates;
        };
        error: boolean;
        transitioning: boolean;
        unavailable: boolean;
        retrying: boolean;
    }

    let {
        anime,
        logo = null,
        currentEpisode,
        episodes,
        nextEpisode = null,
        fallbackImage = null,
        sources,
        poster = null,
        next = null,
        onretry,
        startAt = 0,
        progressEventAt,
        segments,
        error,
        transitioning,
        unavailable,
        retrying,
    }: Props = $props();

    let episodeDialogOpen = $state(false);
    let renderedEpisodeId: string | undefined;

    function releaseDate(value: string | null | undefined) {
        if (!value) {
            return null;
        }
        const parts = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        const date = parts
            ? new Date(Date.UTC(Number(parts[3]), Number(parts[1]) - 1, Number(parts[2])))
            : new Date(value.includes('T') ? value : `${value}T00:00:00Z`);

        return Number.isNaN(date.valueOf())
            ? value
            : new Intl.DateTimeFormat('en', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'UTC',
              }).format(date);
    }

    const movie = $derived(anime.format === 'Movie');
    const episodeTitle = $derived(movie ? anime.title : currentEpisode.title || currentEpisode.label);
    const episodeSubtitle = $derived(
        movie
            ? ''
            : currentEpisode.title
              ? `${currentEpisode.label} – ${currentEpisode.title}`
              : currentEpisode.label
    );
    const formattedReleaseDate = $derived(releaseDate(currentEpisode.releaseDate));

    const player = untrack(
        () =>
            new Player({
                animeId: anime.id,
                episodeId: currentEpisode.id,
                episodeNumber: currentEpisode.number,
                next: nextEpisode?.href ?? next,
                progressEventAt,
                sources,
                startAt,
                segments,
            })
    );

    const isPaused = $derived(
        !player.media.playing &&
            !transitioning &&
            !player.changingEpisode &&
            !player.media.loading &&
            !unavailable &&
            !player.media.error
    );

    $effect(() => {
        if (renderedEpisodeId === undefined) {
            renderedEpisodeId = currentEpisode.id;
            return;
        }
        if (renderedEpisodeId === currentEpisode.id) {
            return;
        }

        renderedEpisodeId = currentEpisode.id;
        episodeDialogOpen = false;
    });

    $effect(() => {
        player.sync({
            animeId: anime.id,
            episodeId: currentEpisode.id,
            episodeNumber: currentEpisode.number,
            next: nextEpisode?.href ?? next,
            progressEventAt,
            sources,
            startAt,
            segments,
        });
    });

    onMount(() => player.mount());
</script>

<!-- The focusable section owns player-wide shortcuts and surface clicks. -->
<div
    bind:this={player.container}
    aria-label={`${anime.title} player`}
    role="application"
    tabindex="-1"
    class:cursor-none={player.media.playing && !player.controlsVisible}
    class="group fixed inset-0 size-full overflow-hidden bg-black select-none focus:outline-none"
>
    {#if player.media.sourceKind === 'iframe'}
        <iframe
            src={player.media.src}
            title={`${anime.title} ${episodeTitle}`}
            class="size-full border-0 bg-black"
            allow="autoplay; fullscreen; picture-in-picture"
            allowfullscreen
        ></iframe>
    {:else}
        <video
            bind:this={player.media.video}
            class="size-full bg-black object-cover"
            playsinline
            preload="metadata"
            poster={poster}
        ></video>
    {/if}

    <!-- Top header bar with back navigation and centered show title/episode subtitle -->
    <div
        class="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between bg-linear-to-b from-black/90 via-black/50 to-transparent p-5 transition-opacity duration-300 sm:p-7 lg:p-9"
        class:opacity-0={!player.controlsVisible && player.media.playing}
    >
        <a
            href={`/anime/${anime.id}`}
            aria-label={`Back to ${anime.title}`}
            class="pointer-events-auto grid size-10 place-items-center text-white/90 drop-shadow transition hover:text-white hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white"
        >
            <CaretLeftIcon size="2rem" weight="bold" aria-hidden="true" />
        </a>

        <div class="pointer-events-none absolute left-1/2 max-w-[60vw] -translate-x-1/2 text-center">
            <p class="truncate text-sm font-bold tracking-wide text-white drop-shadow sm:text-base">
                {anime.title}
            </p>
            {#if episodeSubtitle}
                <p class="mt-0.5 truncate text-xs font-medium text-white/75 drop-shadow sm:text-sm">
                    {episodeSubtitle}
                </p>
            {/if}
        </div>

        <div class="size-11" aria-hidden="true"></div>
    </div>

    <!-- Paused left-side gradient scrim for metadata contrast -->
    <div
        class="pointer-events-none absolute inset-y-0 left-0 z-10 w-full max-w-3xl bg-linear-to-r from-black/75 via-black/40 via-70% to-transparent transition-opacity duration-300 sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl"
        class:opacity-100={isPaused}
        class:opacity-0={!isPaused}
    ></div>

    <!-- Show / Episode Info Overlay: vertically centered on Y-axis, only shown when paused -->
    {#if !unavailable && !transitioning && !player.changingEpisode && !player.media.error}
        <div
            class="pointer-events-none absolute top-1/2 left-8 z-20 max-w-xl -translate-y-1/2 text-white transition-opacity duration-300 sm:left-14 sm:max-w-2xl lg:left-20 lg:max-w-3xl"
            class:opacity-100={isPaused}
            class:opacity-0={!isPaused}
        >
            {#if logo?.url}
                <div class="mb-4">
                    <img
                        src={logo.url}
                        alt={anime.title}
                        loading="eager"
                        style:height={`clamp(${(3 * (logo.size || 100)) / 100}rem, ${(4.5 * (logo.size || 100)) / 100}vw, ${(6 * (logo.size || 100)) / 100}rem)`}
                        class="max-w-[70vw] object-contain object-left drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)] sm:max-w-sm md:max-w-md lg:max-w-lg"
                    />
                </div>
            {:else}
                <h2
                    class="mb-3 text-3xl font-black tracking-tight text-white drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)] sm:text-4xl md:text-5xl"
                >
                    {anime.title}
                </h2>
            {/if}

            <h1
                class="text-2xl font-extrabold tracking-tight text-white drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)] sm:text-3xl md:text-4xl"
            >
                {episodeTitle}
            </h1>

            {#if formattedReleaseDate || currentEpisode.duration}
                <div
                    class="mt-3 flex flex-wrap items-center gap-2.5 text-sm font-semibold text-white/95 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] sm:text-base"
                >
                    {#if formattedReleaseDate}
                        <span>Released on {formattedReleaseDate}</span>
                    {/if}
                    {#if formattedReleaseDate && currentEpisode.duration}
                        <span aria-hidden="true" class="text-white/50">·</span>
                    {/if}
                    {#if currentEpisode.duration}
                        <span>{currentEpisode.duration}</span>
                    {/if}
                </div>
            {/if}

            {#if currentEpisode.overview}
                <p
                    class="mt-4 max-w-xl text-sm leading-relaxed text-white/90 line-clamp-4 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] sm:max-w-2xl sm:text-base sm:line-clamp-5 md:text-lg lg:max-w-3xl"
                >
                    {currentEpisode.overview}
                </p>
            {/if}
        </div>
    {/if}

    {#if player.media.subtitles.length}
        <div
            aria-live="off"
            class="pointer-events-none absolute inset-x-6 bottom-24 z-10 flex flex-col items-center gap-1 text-center leading-snug font-semibold text-white"
        >
            {#each player.media.subtitles as subtitle}
                <span
                    class:subtitle-outline={player.media.captions.edgeStyle === 'outline'}
                    class="whitespace-pre-line px-2 py-0.5"
                    style:color={subtitleTextColors[player.media.captions.textColor].value}
                    style:font-size={`${subtitleSizes[player.media.captions.size].px}px`}
                    style:background-color={subtitleBackgrounds[player.media.captions.background].value === null
                        ? 'transparent'
                        : `rgb(${subtitleBackgrounds[player.media.captions.background].value} / ${player.media.captions.backgroundOpacity})`}
                >
                    {subtitle}
                </span>
            {/each}
        </div>
    {/if}

    {#if transitioning || player.changingEpisode}
        <div
            role="status"
            aria-label="Loading next episode"
            class="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/80"
        >
            <SpinnerGapIcon size="2.5rem" weight="bold" class="animate-spin text-accent" aria-hidden="true" />
        </div>
    {:else if unavailable}
        <div role="alert" class="absolute inset-0 z-20 grid place-items-center bg-black px-6 text-center">
            <div>
                <p class="text-base font-bold">
                    {error
                        ? 'The streaming providers could not load this video.'
                        : 'No video source is available.'}
                </p>
                <p class="mt-2 text-sm text-white/65">Arc tried every available source for this episode.</p>
                <button
                    type="button"
                    disabled={retrying}
                    class="mt-5 min-h-11 border border-white/60 px-5 text-sm font-bold hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-60"
                    onclick={onretry}
                >
                    {retrying ? 'Trying again…' : 'Try again'}
                </button>
            </div>
        </div>
    {:else if player.media.loading}
        <div
            role="status"
            aria-label="Loading video"
            class="pointer-events-none absolute inset-0 grid place-items-center bg-black/40"
        >
            <SpinnerGapIcon size="2.5rem" weight="bold" class="animate-spin text-accent" aria-hidden="true" />
        </div>
    {/if}

    {#if player.media.error && !unavailable && !transitioning && !player.changingEpisode}
        <div role="alert" class="absolute inset-0 z-20 grid place-items-center bg-black px-6 text-center">
            <div>
                <p class="text-base font-bold">This video could not be loaded.</p>
                <p class="mt-2 text-sm text-white/65">Every available provider source was tried.</p>
                <button
                    type="button"
                    class="mt-5 min-h-11 border border-white/60 px-5 text-sm font-bold hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    onclick={() => player.media.retry()}
                >
                    Try again
                </button>
            </div>
        </div>
    {/if}

    {#if !unavailable && !transitioning && !player.changingEpisode && !player.media.error}
        {@const skip = player.visibleSkip}
        {#if skip}
            <button
                type="button"
                disabled={player.media.loading}
                class="absolute right-4 bottom-24 z-30 min-h-11 rounded-sm bg-white/95 px-5 text-sm font-bold text-black shadow-[0_3px_14px_rgba(0,0,0,0.3)] backdrop-blur-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50 sm:right-6 sm:bottom-28"
                onclick={() => {
                    player.media.seek(skip.interval.end);
                    player.showControls();
                }}
            >
                Skip {skip.kind === 'opening' ? 'intro' : 'outro'}
            </button>
        {/if}
    {/if}

    {#if player.media.sourceKind !== 'iframe'}
        <Controls
            player={player}
            hasMultipleEpisodes={episodes.length > 1}
            onopenepisodes={() => (episodeDialogOpen = true)}
        />
    {/if}
</div>

<EpisodeDialog
    open={episodeDialogOpen}
    title={anime.title}
    episodes={episodes}
    currentId={currentEpisode.id}
    image={fallbackImage}
    onclose={() => (episodeDialogOpen = false)}
/>
