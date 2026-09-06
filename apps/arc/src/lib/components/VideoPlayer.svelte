<script lang="ts">
    import type { AnimeEpisode } from '@arc/core/client';
    import EpisodeGridCard from './EpisodeGridCard.svelte';
    import { Player } from '$lib/player/controller.svelte';
    import { subtitleBackgrounds, subtitleSizes, subtitleTextColors } from '$lib/player/subtitle-settings.svelte';
    import type { Sources } from '$lib/player/media';
    import type { EpisodeSkipTimes, SegmentTemplates } from '@arc/core/client';
    import { beforeNavigate } from '$app/navigation';
    import { onMount, untrack } from 'svelte';
    import { CaretLeftIcon } from 'phosphor-svelte';
    import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
    import Button from '$lib/components/ui/button/button.svelte';
    import Controls from './player/Controls.svelte';
    import Modal from './ui/Modal.svelte';
    import { m } from '$lib/i18n.svelte';

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
        onSourceFailure?: () => void;
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
        onSourceFailure,
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
    let video = $state<HTMLVideoElement>();
    let nativeSubtitleElement = $state<HTMLTrackElement>();
    let nativeSubtitleTrack = $state<TextTrack | null>(null);

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

    function subtitleFontSize() {
        const pixels = subtitleSizes[player.media.captions.size].px;
        const scale = pixels / subtitleSizes.normal.px;
        const viewportSize = 7 * scale;
        return `clamp(${pixels * 0.5}px, min(${viewportSize}vh, ${viewportSize}vw), ${pixels}px)`;
    }

    function vttTimestamp(value: number) {
        const milliseconds = Math.max(0, Math.round(value * 1000));
        const hours = Math.floor(milliseconds / 3_600_000);
        const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
        const seconds = Math.floor((milliseconds % 60_000) / 1000);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
            .toString()
            .padStart(2, '0')}.${(milliseconds % 1000).toString().padStart(3, '0')}`;
    }

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
                onSourceFailure,
                segments,
            })
    );

    beforeNavigate(() => player.navigationStarted());

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

    onMount(() => {
        if (!video) {
            return;
        }

        player.media.video = video;
        return player.mount();
    });

    $effect(() => {
        const element = nativeSubtitleElement;
        if (!element) {
            return;
        }

        const cues = player.media.captions.cues;
        let subtitleUrl = '';
        if (cues.length) {
            const vtt = [
                'WEBVTT',
                '',
                ...cues.flatMap((cue, index) => [
                    String(index + 1),
                    `${vttTimestamp(cue.start)} --> ${vttTimestamp(cue.end)}`,
                    cue.text,
                    '',
                ]),
            ].join('\n');
            subtitleUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
            element.src = subtitleUrl;
        } else {
            element.removeAttribute('src');
        }

        nativeSubtitleTrack = element.track;
        player.setNativeSubtitleTrack(nativeSubtitleTrack);
        nativeSubtitleTrack.mode = player.fullscreen && !document.fullscreenElement ? 'showing' : 'disabled';

        return () => {
            if (subtitleUrl) {
                URL.revokeObjectURL(subtitleUrl);
            }
        };
    });
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
    <video
        bind:this={video}
        class="size-full bg-black object-cover"
        playsinline
        preload="metadata"
        poster={poster}
    >
        <track bind:this={nativeSubtitleElement} kind="subtitles" srclang="en" label="Arc" default />
    </video>

    <!-- Top header bar with back navigation and centered show title/episode subtitle -->
    <div
        class="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between bg-linear-to-b from-black/90 via-black/50 to-transparent p-5 transition-opacity duration-300 sm:p-7 lg:p-9"
        class:opacity-0={!player.controlsVisible && player.media.playing}
    >
        <a
            href={`/anime/${anime.id}`}
            aria-label={m.player_back({ title: anime.title })}
            class="pointer-events-auto grid size-10 place-items-center text-white/90 drop-shadow transition-[color,opacity,transform] duration-150 hover:text-white hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white active:scale-90"
        >
            <CaretLeftIcon size="2rem" weight="bold" aria-hidden="true" />
        </a>

        <div class="pointer-events-none absolute inset-x-0 mx-auto max-w-[60vw] text-center">
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
            class="mobile-player-info pointer-events-none absolute inset-y-0 left-8 z-20 hidden max-w-xl flex-col items-start justify-center text-white transition-opacity duration-300 sm:flex sm:left-14 sm:max-w-2xl lg:left-20 lg:max-w-3xl"
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
                    style:font-size={subtitleFontSize()}
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
            aria-label={m.player_loading_next()}
            class="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/80"
        >
            <LoadingSpinner size="2.5rem" />
        </div>
    {:else if unavailable}
        <div role="alert" class="absolute inset-0 z-20 grid place-items-center bg-black px-6 text-center">
            <div>
                <p class="text-base font-bold">
                    {error ? m.player_provider_error() : m.player_no_source()}
                </p>
                <p class="mt-2 text-sm text-white/65">{m.player_tried_sources()}</p>
                <Button
                    variant="unstyled"
                    type="button"
                    disabled={retrying}
                    class="mt-5 min-h-11 border border-white/60 px-5 text-sm font-bold transition-[border-color,transform] duration-150 hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.97] disabled:cursor-wait disabled:opacity-60"
                    onclick={onretry}
                >
                    {retrying ? m.player_trying_again() : m.player_try_again()}
                </Button>
            </div>
        </div>
    {:else if player.media.loading}
        <div
            role="status"
            aria-label={m.player_loading_video()}
            class="pointer-events-none absolute inset-0 grid place-items-center bg-black/40"
        >
            <LoadingSpinner size="2.5rem" />
        </div>
    {/if}

    {#if player.media.error && !unavailable && !transitioning && !player.changingEpisode}
        <div role="alert" class="absolute inset-0 z-20 grid place-items-center bg-black px-6 text-center">
            <div>
                <p class="text-base font-bold">{m.player_load_failed()}</p>
                <p class="mt-2 text-sm text-white/65">{m.player_tried_provider()}</p>
                <Button
                    variant="unstyled"
                    type="button"
                    class="mt-5 min-h-11 border border-white/60 px-5 text-sm font-bold transition-[border-color,transform] duration-150 hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.97]"
                    onclick={() => player.media.retry()}
                >
                    {m.player_try_again()}
                </Button>
            </div>
        </div>
    {/if}

    {#if !unavailable && !transitioning && !player.changingEpisode && !player.media.error}
        {@const skip = player.visibleSkip}
        {#if skip}
            <Button
                variant="unstyled"
                type="button"
                disabled={player.media.loading}
                class="absolute right-4 bottom-24 z-30 min-h-11 rounded-sm bg-white/95 px-5 text-sm font-bold text-black shadow-[0_3px_14px_rgba(0,0,0,0.3)] backdrop-blur-sm transition-[background-color,translate,scale,opacity] duration-200 ease-out hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none motion-reduce:starting:translate-y-0 starting:translate-y-1.5 starting:opacity-0 sm:right-6 sm:bottom-28"
                onclick={() => {
                    player.media.seek(skip.interval.end);
                    player.showControls();
                }}
            >
                {m.player_skip({ kind: skip.kind === 'opening' ? 'intro' : 'outro' })}
            </Button>
        {/if}
    {/if}

    <Controls
        player={player}
        hasMultipleEpisodes={episodes.length > 1}
        episodesOpen={episodeDialogOpen}
        onopenepisodes={() => (episodeDialogOpen = !episodeDialogOpen)}
    />
</div>

{#if episodeDialogOpen}
    <Modal id="episode-dialog" open wide title={anime.title} onclose={() => (episodeDialogOpen = false)}>
        {#snippet children()}
            <div class="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 lg:px-10">
                <div class="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                    {#each episodes as episode}
                        <EpisodeGridCard
                            episode={episode}
                            title={anime.title}
                            image={fallbackImage}
                            current={episode.id === currentEpisode.id}
                            context="dialog"
                        />
                    {/each}
                </div>
            </div>
        {/snippet}
    </Modal>
{/if}

<style>
    @media (pointer: coarse) and (hover: none) and (max-width: 64rem) {
        .mobile-player-info {
            display: none;
        }
    }
</style>
