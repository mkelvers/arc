<script lang="ts">
    import { Player } from '$lib/player/controller.svelte';
    import type { Sources } from '$lib/player/media';
    import { ProgressSchedule } from '$lib/player/progress';
    import {
        activeSkip as findActiveSkip,
        skipTimesDraft,
        type EpisodeSkipTimes,
        type SkipKind,
    } from '$lib/player/skip-times';
    import { onMount, untrack } from 'svelte';
    import {
        CornersInIcon,
        CornersOutIcon,
        GearIcon,
        PauseIcon,
        PlayIcon,
        SpeakerHighIcon,
        SpeakerSlashIcon,
        SpinnerGapIcon,
    } from 'phosphor-svelte';
    import Settings from './player/Settings.svelte';
    import Timeline from './player/Timeline.svelte';

    interface Props {
        animeId: number;
        canEditSkipTimes: boolean;
        episodeId: string;
        episodeNumber: number;
        sources: Sources;
        label: string;
        poster?: string | null;
        next?: string | null;
        onretry: () => void;
        startAt?: number;
        skipTimes: EpisodeSkipTimes;
        streamError: boolean;
        transitioning: boolean;
        unavailable: boolean;
        retrying: boolean;
    }

    let {
        animeId,
        canEditSkipTimes,
        episodeId,
        episodeNumber,
        sources,
        label,
        poster = null,
        next = null,
        onretry,
        startAt = 0,
        skipTimes,
        streamError,
        transitioning,
        unavailable,
        retrying,
    }: Props = $props();
    const player = new Player(
        () => sources,
        () => next,
    );
    const media = player.media;
    let progressSchedule = new ProgressSchedule();
    let progressStarted = false;
    let episodeEnded = false;
    let finalSaveSent = false;
    let saveQueue: Promise<void> = Promise.resolve();
    let mounted = $state(false);
    let changingEpisode = $state(false);
    let loadedSources = untrack(() => sources);
    let trackedEpisode = untrack(() => ({
        animeId,
        episodeId,
        episodeNumber,
    }));
    let receivedSkipTimes = untrack(() => skipTimes);
    let skipEpisodeId = untrack(() => episodeId);
    let currentSkipTimes = $state(untrack(() => skipTimes));
    let skipDraft = $state(untrack(() => skipTimesDraft(skipTimes)));
    let skipSaving = $state(false);
    let skipError = $state<string | null>(null);

    const visibleSkip = $derived(
        findActiveSkip(currentSkipTimes, media.currentTime),
    );

    $effect(() => {
        const incoming = skipTimes;
        const incomingEpisodeId = episodeId;
        if (
            incoming === receivedSkipTimes &&
            incomingEpisodeId === skipEpisodeId
        ) {
            return;
        }

        receivedSkipTimes = incoming;
        skipEpisodeId = incomingEpisodeId;
        currentSkipTimes = incoming;
        skipDraft = skipTimesDraft(incoming);
        skipError = null;
    });

    $effect(() => {
        const incomingSources = sources;
        const incomingEpisode = { animeId, episodeId, episodeNumber };
        const episodeChanged =
            incomingEpisode.animeId !== trackedEpisode.animeId ||
            incomingEpisode.episodeId !== trackedEpisode.episodeId;

        if (!mounted) {
            loadedSources = incomingSources;
            return;
        }
        if (!episodeChanged && incomingSources === loadedSources) {
            return;
        }

        if (episodeChanged && !episodeEnded) {
            void saveProgress(false, true);
        }

        changingEpisode = true;
        loadedSources = incomingSources;
        trackedEpisode = incomingEpisode;
        progressSchedule = new ProgressSchedule();
        progressStarted = false;
        episodeEnded = false;
        finalSaveSent = false;
        void media.changeEpisode();
    });

    function progressPayload(completed: boolean) {
        const positionSeconds = media.video?.currentTime;
        const durationSeconds = media.video?.duration;

        if (
            !Number.isFinite(positionSeconds) ||
            !Number.isFinite(durationSeconds) ||
            durationSeconds <= 0
        ) {
            return null;
        }

        return {
            ...trackedEpisode,
            positionSeconds,
            durationSeconds,
            completed,
        };
    }

    async function sendProgress(
        payload: NonNullable<ReturnType<typeof progressPayload>>,
        keepalive = false,
    ) {
        const response = await fetch('/api/progress', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify(payload),
            credentials: 'same-origin',
            keepalive,
        });

        if (!response.ok) {
            throw new Error(
                `Progress request failed with ${response.status}`,
            );
        }
    }

    function saveProgress(completed = false, keepalive = false) {
        const payload = progressPayload(completed);
        if (!payload) {
            return Promise.resolve();
        }

        saveQueue = saveQueue
            .then(() => sendProgress(payload, keepalive))
            .catch((cause) => {
                console.error('Playback progress save failed', cause);
            });

        return saveQueue;
    }

    function saveBeforeLeave() {
        if (episodeEnded || finalSaveSent) {
            return;
        }

        const payload = progressPayload(false);
        if (!payload) {
            return;
        }

        finalSaveSent = true;
        void sendProgress(payload, true).catch(() => undefined);
    }

    function handleMetadata() {
        changingEpisode = false;
        media.handleMetadata(startAt);

        if (progressStarted) {
            return;
        }

        progressStarted = true;
        progressSchedule.start(media.video.currentTime);
        void saveProgress();
    }

    function handleTimeUpdate() {
        media.currentTime = media.video.currentTime;

        const reason = progressSchedule.update({
            currentTime: media.video.currentTime,
            duration: media.video.duration,
            playing: media.playing,
        });
        if (reason) {
            void saveProgress();
        }
    }

    async function handleEnded() {
        episodeEnded = true;
        media.currentTime = media.video.currentTime;
        await saveProgress(true, true);
        media.ended();
    }

    async function persistSkipTimes(
        times: Pick<EpisodeSkipTimes, 'opening' | 'ending'>,
    ) {
        skipSaving = true;
        skipError = null;

        try {
            const response = await fetch('/api/episodes/skip-times', {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    anilistId: trackedEpisode.animeId,
                    episodeId: trackedEpisode.episodeId,
                    ...times,
                }),
                credentials: 'same-origin',
            });
            if (!response.ok) {
                throw new Error(
                    response.status === 401
                        ? 'Sign in to edit segments.'
                        : 'Segments could not be saved.',
                );
            }

            currentSkipTimes = { ...times, source: 'manual' };
            skipDraft = skipTimesDraft(currentSkipTimes);
        } catch (cause) {
            skipError =
                cause instanceof Error
                    ? cause.message
                    : 'Segments could not be saved.';
        } finally {
            skipSaving = false;
        }
    }

    function markSkip(kind: SkipKind, edge: 'start' | 'end') {
        const value = Math.round(media.video.currentTime * 1_000) / 1_000;
        const marked = { ...skipDraft[kind], [edge]: value };
        skipDraft = { ...skipDraft, [kind]: marked };
        skipError = null;

        if (marked.start === null || marked.end === null) {
            return;
        }
        if (marked.end <= marked.start) {
            skipError = 'The end must be after the start.';
            return;
        }

        void persistSkipTimes({
            opening:
                kind === 'opening'
                    ? { start: marked.start, end: marked.end }
                    : currentSkipTimes.opening,
            ending:
                kind === 'ending'
                    ? { start: marked.start, end: marked.end }
                    : currentSkipTimes.ending,
        });
    }

    function clearSkip(kind: SkipKind) {
        void persistSkipTimes({
            opening:
                kind === 'opening' ? null : currentSkipTimes.opening,
            ending: kind === 'ending' ? null : currentSkipTimes.ending,
        });
    }

    onMount(() => {
        const closePlayer = player.mount();
        mounted = true;

        return () => {
            mounted = false;
            saveBeforeLeave();
            closePlayer();
        };
    });
</script>

<svelte:window
    onpointermove={(event) => player.handlePointerMove(event)}
    onfullscreenchange={() => player.fullscreenChanged()}
    onpagehide={saveBeforeLeave}
    onpageshow={() => (finalSaveSent = false)}
/>

<!-- The focusable section owns player-wide shortcuts and surface clicks. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
    bind:this={player.container}
    aria-label={`${label} player`}
    tabindex="-1"
    class:cursor-none={media.playing && !player.controlsVisible}
    class:h-full={player.fullscreen}
    class="group relative aspect-21/9 w-full overflow-hidden bg-black focus:outline-none"
    onclick={(event) => player.handleClick(event)}
    ondblclick={(event) => player.handleDoubleClick(event)}
    onkeydown={(event) => player.handleKeydown(event)}
>
    <video
        bind:this={media.video}
        class="size-full bg-black object-cover"
        playsinline
        preload="metadata"
        {poster}
        onloadstart={() => (media.loading = true)}
        onloadedmetadata={handleMetadata}
        ondurationchange={() => (media.duration = media.video.duration)}
        ontimeupdate={handleTimeUpdate}
        onprogress={() => media.updateBuffered()}
        onwaiting={() => media.handleWaiting()}
        oncanplay={() => media.handleCanPlay()}
        onerror={() => void media.tryNextSource()}
        onplay={() => void saveProgress()}
        onplaying={() => media.handlePlaying()}
        onpause={() => {
            media.playing = false;
            player.showControls();
            if (!episodeEnded && !changingEpisode) {
                void saveProgress();
            }
        }}
        onended={handleEnded}
        onvolumechange={() => media.volumeChanged()}
    >
    </video>

    {#if media.subtitles.length}
        <div
            aria-live="off"
            class="pointer-events-none absolute inset-x-6 bottom-20 z-10 flex flex-col items-center gap-1 text-center text-lg leading-snug font-semibold text-white sm:text-4xl"
        >
            {#each media.subtitles as subtitle}
                <span class="whitespace-pre-line bg-black/80 px-2 py-0.5">
                    {subtitle}
                </span>
            {/each}
        </div>
    {/if}

    {#if transitioning || changingEpisode}
        <div
            role="status"
            aria-label="Loading next episode"
            class="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/80"
        >
            <SpinnerGapIcon
                size="2.5rem"
                weight="bold"
                class="animate-spin text-accent"
                aria-hidden="true"
            />
        </div>
    {:else if unavailable}
        <div
            role="alert"
            class="absolute inset-0 z-20 grid place-items-center bg-black px-6 text-center"
        >
            <div>
                <p class="text-base font-bold">
                    {streamError
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
                    onclick={onretry}
                >
                    {retrying ? 'Trying again…' : 'Try again'}
                </button>
            </div>
        </div>
    {:else if media.loading}
        <div
            role="status"
            aria-label="Loading video"
            class="pointer-events-none absolute inset-0 grid place-items-center bg-black/40"
        >
            <SpinnerGapIcon
                size="2.5rem"
                weight="bold"
                class="animate-spin text-accent"
                aria-hidden="true"
            />
        </div>
    {/if}

    {#if media.error && !unavailable && !transitioning && !changingEpisode}
        <div
            role="alert"
            class="absolute inset-0 z-20 grid place-items-center bg-black px-6 text-center"
        >
            <div>
                <p class="text-base font-bold">This video could not be loaded.</p>
                <p class="mt-2 text-sm text-white/65">
                    Every available provider source was tried.
                </p>
                <button
                    type="button"
                    class="mt-5 min-h-11 border border-white/60 px-5 text-sm font-bold hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    onclick={() => media.retry()}
                >
                    Try again
                </button>
            </div>
        </div>
    {/if}

    {#if visibleSkip &&
        !unavailable &&
        !transitioning &&
        !changingEpisode &&
        !media.error}
        <button
            type="button"
            disabled={media.loading}
            class="absolute right-4 bottom-24 z-20 min-h-11 rounded-sm bg-white/95 px-5 text-sm font-bold text-black shadow-[0_3px_14px_rgba(0,0,0,0.3)] backdrop-blur-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50 sm:right-6 sm:bottom-28"
            onclick={() => {
                media.seek(visibleSkip.interval.end);
                player.showControls();
            }}
        >
            Skip {visibleSkip.kind === 'opening' ? 'intro' : 'outro'}
        </button>
    {/if}

    <div
        class:pointer-events-none={!player.controlsVisible && media.playing}
        class:opacity-0={!player.controlsVisible && media.playing}
        class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/45 to-transparent px-4 pt-16 pb-4 text-white transition-opacity duration-300 sm:px-6 sm:pb-5"
    >
        <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-4">
                <button
                    type="button"
                    aria-label={media.playing ? 'Pause' : 'Play'}
                    disabled={media.loading}
                    class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white disabled:opacity-50"
                    onclick={() => {
                        media.togglePlayback();
                        player.showControls();
                    }}
                >
                    {#if media.playing}
                        <PauseIcon size="1.5rem" aria-hidden="true" />
                    {:else}
                        <PlayIcon size="1.5rem" weight="fill" aria-hidden="true" />
                    {/if}
                </button>

                <div class="group/volume relative">
                    <div
                        class="pointer-events-none absolute bottom-full left-1/2 flex h-40 w-12 -translate-x-1/2 items-end justify-center pb-3 opacity-0 transition-opacity group-hover/volume:pointer-events-auto group-hover/volume:opacity-100 group-focus-within/volume:pointer-events-auto group-focus-within/volume:opacity-100"
                    >
                        <div class="relative h-28 w-8 py-1.5">
                            <div class="relative mx-auto h-full w-1.5 rounded-full bg-white/35 shadow-sm">
                                <span
                                    aria-hidden="true"
                                    class="absolute inset-x-0 bottom-0 rounded-full bg-accent"
                                    style={`height: ${media.volumeProgress}%`}
                                ></span>
                                <span
                                    aria-hidden="true"
                                    class="absolute left-1/2 size-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow-sm ring-1 ring-black/10"
                                    style={`bottom: ${media.volumeProgress}%`}
                                ></span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={media.muted ? 0 : media.volume}
                                aria-label="Volume"
                                disabled={media.loading}
                                class="volume-input absolute inset-0 size-full cursor-pointer opacity-0"
                                oninput={(event) =>
                                    media.setVolume(
                                        Number(event.currentTarget.value),
                                    )}
                            />
                        </div>
                    </div>

                    <button
                        type="button"
                        aria-label={media.muted ? 'Unmute' : 'Mute'}
                        disabled={media.loading}
                        class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white disabled:opacity-50"
                        onclick={() => {
                            media.toggleMute();
                            player.showControls();
                        }}
                    >
                        {#if media.muted}
                            <SpeakerSlashIcon size="1.5rem" aria-hidden="true" />
                        {:else}
                            <SpeakerHighIcon size="1.5rem" aria-hidden="true" />
                        {/if}
                    </button>
                </div>
            </div>

            <div class="flex items-center gap-4">
                <div class="relative">
                    <button
                        type="button"
                        aria-label="Playback settings"
                        aria-expanded={player.settingsOpen}
                        aria-controls="player-settings"
                        disabled={media.loading}
                        class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white disabled:opacity-50"
                        onclick={() => player.openSettings()}
                    >
                        <GearIcon size="1.5rem" aria-hidden="true" />
                    </button>

                    {#if player.settingsOpen}
                        <Settings
                            bind:view={player.settingsView}
                            autoplay={media.autoplay}
                            bestQuality={media.bestQuality}
                            {canEditSkipTimes}
                            mode={media.mode}
                            qualities={media.qualities}
                            quality={media.quality}
                            qualityText={media.qualityText}
                            audioModes={media.audioModes}
                            onautoplay={() => media.toggleAutoplay()}
                            onmode={(mode) => media.switchMode(mode)}
                            onquality={(quality) =>
                                media.switchQuality(quality)}
                            onskipclear={clearSkip}
                            onskipmark={markSkip}
                            {skipDraft}
                            {skipError}
                            {skipSaving}
                        />
                    {/if}
                </div>

                <button
                    type="button"
                    aria-label={player.fullscreen
                        ? 'Exit fullscreen'
                        : 'Enter fullscreen'}
                    disabled={media.loading}
                    class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white disabled:opacity-50"
                    onclick={() => {
                        void player.toggleFullscreen();
                        player.showControls();
                    }}
                >
                    {#if player.fullscreen}
                        <CornersInIcon
                            size="1.5rem"
                            weight="bold"
                            aria-hidden="true"
                        />
                    {:else}
                        <CornersOutIcon
                            size="1.5rem"
                            weight="bold"
                            aria-hidden="true"
                        />
                    {/if}
                </button>
            </div>
        </div>

        <Timeline
            buffered={media.buffered}
            current={media.currentTime}
            duration={media.duration}
            onactivity={() => player.showControls()}
            ondone={() => player.focus()}
            onscrub={(active) => player.setScrubbing(active)}
            onseek={(seconds) => media.seek(seconds)}
        />
    </div>
</section>
