<script lang="ts">
    import { Player } from '$lib/player/controller.svelte';
    import {
        subtitleBackgrounds,
        subtitleSizes,
        subtitleTextColors,
        type Sources,
    } from '$lib/player/media';
    import { nextProgressEventAt, ProgressSchedule } from '$lib/player/progress';
    import {
        activeSkip as findActiveSkip,
        intervalFromTemplate,
        parseSegmentSaveResult,
        skipTimesDraft,
        type EpisodeSkipTimes,
        type SegmentTemplates,
        type SkipInterval,
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
        episodeId: string;
        episodeNumber: number;
        sources: Sources;
        label: string;
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
        animeId,
        episodeId,
        episodeNumber,
        sources,
        label,
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
    const player = new Player(
        () => sources,
        () => next
    );
    const media = player.media;
    let progressSchedule = new ProgressSchedule();
    let progressStarted = false;
    let eventCursor = untrack(() => progressEventAt);
    let eventClock: { base: number; startedAt: number } | null = null;
    let hasPlayed = false;
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
    let receivedSkipTimes = untrack(() => segments.times);
    let receivedSegmentTemplates = untrack(() => segments.templates);
    let skipEpisodeId = untrack(() => episodeId);
    let currentSkipTimes = $state(untrack(() => segments.times));
    let currentSegmentTemplates = $state(untrack(() => segments.templates));
    let skipDraft = $state(untrack(() => skipTimesDraft(segments.times)));
    let creatingTemplate = $state<SkipKind | null>(null);
    let skipSaving = $state(false);
    let skipError = $state<string | null>(null);

    const visibleSkip = $derived(findActiveSkip(currentSkipTimes, media.currentTime));

    $effect(() => {
        const incoming = progressEventAt;
        if (!mounted || incoming <= eventCursor) {
            return;
        }

        eventCursor = incoming;
        eventClock = { base: incoming, startedAt: performance.now() };
    });

    $effect(() => {
        const incoming = segments.times;
        const incomingEpisodeId = episodeId;
        if (incoming === receivedSkipTimes && incomingEpisodeId === skipEpisodeId) {
            return;
        }

        receivedSkipTimes = incoming;
        skipEpisodeId = incomingEpisodeId;
        currentSkipTimes = incoming;
        skipDraft = skipTimesDraft(incoming);
        creatingTemplate = null;
        skipError = null;
    });

    $effect(() => {
        const incoming = segments.templates;
        if (incoming === receivedSegmentTemplates) {
            return;
        }

        receivedSegmentTemplates = incoming;
        currentSegmentTemplates = incoming;
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

        if (episodeChanged && hasPlayed && !episodeEnded) {
            void saveProgress(false, true);
        }

        changingEpisode = true;
        loadedSources = incomingSources;
        trackedEpisode = incomingEpisode;
        progressSchedule = new ProgressSchedule();
        progressStarted = false;
        hasPlayed = false;
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

        const estimatedServerTime = eventClock
            ? eventClock.base + performance.now() - eventClock.startedAt
            : eventCursor + 1;
        eventCursor = nextProgressEventAt(eventCursor, estimatedServerTime);

        return {
            ...trackedEpisode,
            positionSeconds,
            durationSeconds,
            completed,
            eventAt: eventCursor,
        };
    }

    async function sendProgress(
        payload: NonNullable<ReturnType<typeof progressPayload>>,
        keepalive = false
    ) {
        const response = await fetch('/api/episodes/progress', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify(payload),
            credentials: 'same-origin',
            keepalive,
        });

        if (!response.ok) {
            throw new Error(`Progress request failed with ${response.status}`);
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
        if (!hasPlayed || episodeEnded || finalSaveSent) {
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
    }

    function handleTimeUpdate() {
        media.currentTime = media.video.currentTime;

        const reason = progressSchedule.update({
            currentTime: media.video.currentTime,
            duration: media.video.duration,
            playing: media.playing,
        });
        if (reason === 'ending') {
            episodeEnded = true;
            void saveProgress(true, true);
        } else if (reason === 'periodic') {
            void saveProgress();
        }
    }

    async function handleEnded() {
        episodeEnded = true;
        media.currentTime = media.video.currentTime;
        await saveProgress(true, true);
        media.ended();
    }

    type SegmentSave =
        | { operation: 'clear' }
        | { operation: 'apply-template'; start: number }
        | { operation: 'set'; interval: SkipInterval; createTemplate: boolean };

    async function persistSegment(kind: SkipKind, save: SegmentSave) {
        const episode = { ...trackedEpisode };
        skipSaving = true;
        skipError = null;

        try {
            const response = await fetch('/api/episodes/skip-times', {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    anilistId: episode.animeId,
                    episodeId: episode.episodeId,
                    kind,
                    ...save,
                }),
                credentials: 'same-origin',
            });
            if (!response.ok) {
                throw new Error(
                    response.status === 401
                        ? 'Sign in to edit segments.'
                        : 'Segments could not be saved.'
                );
            }

            const saved = parseSegmentSaveResult(await response.json());
            if (!saved) {
                throw new Error('Arc returned invalid segment data.');
            }
            if (
                episode.animeId !== trackedEpisode.animeId ||
                episode.episodeId !== trackedEpisode.episodeId
            ) {
                return;
            }

            currentSkipTimes = saved.times;
            currentSegmentTemplates = saved.templates;
            skipDraft = skipTimesDraft(saved.times);
            creatingTemplate = null;
        } catch (cause) {
            skipError = cause instanceof Error ? cause.message : 'Segments could not be saved.';
        } finally {
            skipSaving = false;
        }
    }

    function markSkip(kind: SkipKind, edge: 'start' | 'end') {
        const value = Math.round(media.video.currentTime * 1_000) / 1_000;
        const template = currentSegmentTemplates[kind];
        if (edge === 'start' && template && creatingTemplate !== kind) {
            const interval = intervalFromTemplate(value, template.duration);
            if (!interval) {
                skipError = 'The template could not be applied.';
                return;
            }

            skipDraft = { ...skipDraft, [kind]: interval };
            void persistSegment(kind, { operation: 'apply-template', start: value });
            return;
        }

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

        const interval = { start: marked.start, end: marked.end };
        void persistSegment(kind, {
            operation: 'set',
            interval,
            createTemplate: creatingTemplate === kind || !template,
        });
    }

    function clearSkip(kind: SkipKind) {
        creatingTemplate = null;
        void persistSegment(kind, { operation: 'clear' });
    }

    function startTemplate(kind: SkipKind) {
        creatingTemplate = kind;
        skipDraft = { ...skipDraft, [kind]: { start: null, end: null } };
        skipError = null;
    }

    function cancelTemplate(kind: SkipKind) {
        creatingTemplate = null;
        skipDraft = {
            ...skipDraft,
            [kind]: {
                start: currentSkipTimes[kind]?.start ?? null,
                end: currentSkipTimes[kind]?.end ?? null,
            },
        };
        skipError = null;
    }

    onMount(() => {
        const closePlayer = player.mount();
        const container = player.container;
        const click = (event: MouseEvent) => player.handleClick(event);
        const doubleClick = (event: MouseEvent) => player.handleDoubleClick(event);
        const keydown = (event: KeyboardEvent) => player.handleKeydown(event);

        container.addEventListener('click', click);
        container.addEventListener('dblclick', doubleClick);
        container.addEventListener('keydown', keydown);
        mounted = true;
        eventClock = { base: progressEventAt, startedAt: performance.now() };

        return () => {
            container.removeEventListener('click', click);
            container.removeEventListener('dblclick', doubleClick);
            container.removeEventListener('keydown', keydown);
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
<div
    bind:this={player.container}
    aria-label={`${label} player`}
    role="application"
    tabindex="-1"
    class:cursor-none={media.playing && !player.controlsVisible}
    class:h-full={player.fullscreen}
    class="group relative aspect-21/9 w-full overflow-hidden bg-black focus:outline-none"
>
    <video
        bind:this={media.video}
        class="size-full bg-black object-cover"
        playsinline
        preload="metadata"
        poster={poster}
        onloadstart={() => (media.loading = true)}
        onloadedmetadata={handleMetadata}
        ondurationchange={() => (media.duration = media.video.duration)}
        ontimeupdate={handleTimeUpdate}
        onprogress={() => media.updateBuffered()}
        onwaiting={() => media.handleWaiting()}
        oncanplay={() => media.handleCanPlay()}
        onerror={() => void media.tryNextSource()}
        onplay={() => {
            hasPlayed = true;
            void saveProgress();
        }}
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
            class="pointer-events-none absolute inset-x-6 bottom-20 z-10 flex flex-col items-center gap-1 text-center leading-snug font-semibold text-white"
        >
            {#each media.subtitles as subtitle}
                <span
                    class:subtitle-outline={media.subtitleEdgeStyle === 'outline'}
                    class="whitespace-pre-line px-2 py-0.5"
                    style:color={subtitleTextColors[media.subtitleTextColor].value}
                    style:font-size={`${subtitleSizes[media.subtitleSize].px}px`}
                    style:background-color={subtitleBackgrounds[media.subtitleBackground].value ===
                    null
                        ? 'transparent'
                        : `rgb(${subtitleBackgrounds[media.subtitleBackground].value} / ${media.subtitleBackgroundOpacity})`}
                >
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
                    {error
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
                <p class="mt-2 text-sm text-white/65">Every available provider source was tried.</p>
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

    {#if visibleSkip && !unavailable && !transitioning && !changingEpisode && !media.error}
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
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={media.muted ? 0 : media.volume}
                                aria-label="Volume"
                                disabled={media.loading}
                                class="volume-input absolute inset-0 size-full cursor-pointer"
                                oninput={(event) =>
                                    media.setVolume(Number(event.currentTarget.value))}
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
                            segments={{
                                canEdit: segments.canEdit,
                                templates: currentSegmentTemplates,
                            }}
                            mode={media.mode}
                            qualities={media.qualities}
                            quality={media.quality}
                            qualityText={media.qualityText}
                            audioModes={media.audioModes}
                            onautoplay={() => media.toggleAutoplay()}
                            onmode={(mode) => media.switchMode(mode)}
                            onquality={(quality) => media.switchQuality(quality)}
                            onskipclear={clearSkip}
                            onskipmark={markSkip}
                            onskiptemplatecancel={cancelTemplate}
                            onskiptemplatenew={startTemplate}
                            episodeNumber={episodeNumber}
                            creatingTemplate={creatingTemplate}
                            skipDraft={skipDraft}
                            skipError={skipError}
                            skipSaving={skipSaving}
                            subtitleMode={media.subtitleMode}
                            subtitleOptions={media.subtitleOptions}
                            subtitleSize={media.subtitleSize}
                            onsubtitlemode={(mode) => media.switchSubtitleMode(mode)}
                            onsubtitlesize={(size) => media.switchSubtitleSize(size)}
                        />
                    {/if}
                </div>

                <button
                    type="button"
                    aria-label={player.fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    disabled={media.loading}
                    class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white disabled:opacity-50"
                    onclick={() => {
                        void player.toggleFullscreen();
                        player.showControls();
                    }}
                >
                    {#if player.fullscreen}
                        <CornersInIcon size="1.5rem" weight="bold" aria-hidden="true" />
                    {:else}
                        <CornersOutIcon size="1.5rem" weight="bold" aria-hidden="true" />
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
</div>
