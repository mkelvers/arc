<script lang="ts">
    import { goto } from '$app/navigation';
    import type { AudioMode } from '$lib/anime';
    import { onMount, tick } from 'svelte';
    import { CaretLeftIcon, CaretRightIcon, SpinnerGapIcon } from 'phosphor-svelte';

    type SettingsView = 'main' | 'audio' | 'quality';

    interface Stream {
        url: string;
        quality: string | null;
        audioDelay: number;
    }

    interface Props {
        sources: Partial<Record<AudioMode, Stream[]>>;
        label: string;
        poster?: string | null;
        next?: string | null;
    }

    let { sources, label, poster = null, next = null }: Props = $props();
    let container: HTMLElement;
    let video: HTMLVideoElement;
    let mode = $state<AudioMode>('sub');
    let playing = $state(false);
    let muted = $state(false);
    let loading = $state(true);
    let controlsVisible = $state(true);
    let fullscreen = $state(false);
    let scrubbing = $state(false);
    let currentTime = $state(0);
    let duration = $state(0);
    let buffered = $state(0);
    let previewTime = $state<number | null>(null);
    let previewPosition = $state(0);
    let volume = $state(1);
    let settingsOpen = $state(false);
    let settingsView = $state<SettingsView>('main');
    let autoplay = $state(true);
    let quality = $state('best');
    let sourceIndex = $state(0);
    let playbackError = $state(false);
    let lastVolume = 1;
    let resumeAt: number | null = null;
    let resumePlayback = false;
    let autoplayAttempted = false;
    let hideControlsTimer: ReturnType<typeof setTimeout>;
    let audioContext: AudioContext | null = null;
    let audioSource: MediaElementAudioSourceNode | null = null;
    let audioDelayNode: DelayNode | null = null;

    const modeSources = $derived(
        sources[mode] ?? sources.sub ?? sources.dub ?? sources.raw ?? [],
    );
    const qualities = $derived(
        modeSources
            .map((source) => source.quality)
            .filter(
                (value, index, values): value is string =>
                    Boolean(value) && values.indexOf(value) === index,
            ),
    );
    const orderedSources = $derived.by(() => {
        if (quality === 'best') return modeSources;

        const selected = modeSources.find(
            (source) => source.quality === quality,
        );
        return selected
            ? [
                  selected,
                  ...modeSources.filter((source) => source !== selected),
              ]
            : modeSources;
    });
    const src = $derived(orderedSources[sourceIndex]?.url ?? '');
    const audioDelay = $derived(
        orderedSources[sourceIndex]?.audioDelay ?? 0,
    );
    const bestQuality = $derived(modeSources[0]?.quality ?? null);
    const availableAudioModes = $derived(
        (['sub', 'dub', 'raw'] as const).filter(
            (audioMode) => Boolean(sources[audioMode]?.length),
        ),
    );
    const audioLabel = $derived(
        mode === 'dub'
            ? 'English'
            : mode === 'raw'
              ? 'Japanese (Raw)'
              : 'Japanese',
    );
    const qualityLabel = $derived(
        quality === 'best'
            ? bestQuality
                ? `Auto ${bestQuality}`
                : 'Auto'
            : quality,
    );
    const progress = $derived(duration ? (currentTime / duration) * 100 : 0);
    const bufferedProgress = $derived(duration ? (buffered / duration) * 100 : 0);
    const volumeProgress = $derived((muted ? 0 : volume) * 100);
    const previewEdgePadding = 42;

    function formatTime(seconds: number) {
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

        const hours = Math.floor(seconds / 3_600);
        const minutes = Math.floor((seconds % 3_600) / 60);
        if (hours) return minutes ? `${hours}h, ${minutes}m` : `${hours}h`;

        const remainder = Math.floor(seconds % 60)
            .toString()
            .padStart(2, '0');

        return `${minutes}:${remainder}`;
    }

    function showControls() {
        controlsVisible = true;
        clearTimeout(hideControlsTimer);

        if (playing && !scrubbing && !settingsOpen) {
            hideControlsTimer = setTimeout(() => {
                controlsVisible = false;
            }, 2_000);
        }
    }

    function configureAudioDelay(reset = false) {
        if (!audioDelay && !audioContext) return;

        audioContext ??= new AudioContext();
        audioSource ??= audioContext.createMediaElementSource(video);

        if (reset) {
            audioSource.disconnect();
            audioDelayNode?.disconnect();
            audioDelayNode = null;
        }

        if (!audioDelayNode) {
            audioDelayNode = audioContext.createDelay(10);
            audioSource.connect(audioDelayNode);
            audioDelayNode.connect(audioContext.destination);
        }
        audioDelayNode.delayTime.setValueAtTime(
            audioDelay,
            audioContext.currentTime,
        );
    }

    function resumeAudio() {
        configureAudioDelay();
        if (audioContext?.state === 'suspended') {
            void audioContext.resume();
        }
    }

    function togglePlayback() {
        if (video.paused) {
            resumeAudio();
            video.play().catch(() => undefined);
        } else video.pause();
    }

    function toggleMute() {
        resumeAudio();
        if (video.muted || video.volume === 0) {
            video.muted = false;
            video.volume = lastVolume;
        } else {
            lastVolume = video.volume;
            video.muted = true;
        }
    }

    function changeVolume(event: Event) {
        resumeAudio();
        const value = Number((event.currentTarget as HTMLInputElement).value);
        video.volume = value;
        video.muted = value === 0;
        if (value > 0) lastVolume = value;
    }

    function isHdQuality(value: string | null) {
        const resolution = Number(value?.match(/\d+/)?.[0] ?? 0);
        return resolution >= 720;
    }

    function toggleAutoplay() {
        autoplay = !autoplay;
        localStorage.setItem('arc:autoplay', String(autoplay));
        showControls();
    }

    async function switchMode(next: AudioMode) {
        if (!sources[next] || next === mode) {
            showControls();
            return;
        }

        resumeAt = video.currentTime;
        resumePlayback = !video.paused;
        mode = next;
        if (
            quality !== 'best' &&
            !sources[next]?.some((source) => source.quality === quality)
        ) {
            quality = 'best';
            localStorage.setItem('arc:quality', quality);
        }
        sourceIndex = 0;
        playbackError = false;
        loading = true;
        buffered = 0;
        previewTime = null;
        localStorage.setItem('arc:audio-mode', next);

        await tick();
        configureAudioDelay(true);
        resumeAudio();
        video.load();
        showControls();
    }

    async function switchQuality(next: string) {
        if (next === quality) {
            showControls();
            return;
        }

        resumeAt = video.currentTime;
        resumePlayback = !video.paused;
        quality = next;
        sourceIndex = 0;
        playbackError = false;
        loading = true;
        buffered = 0;
        previewTime = null;
        localStorage.setItem('arc:quality', next);

        await tick();
        configureAudioDelay(true);
        resumeAudio();
        video.load();
        showControls();
    }

    async function tryNextSource() {
        if (sourceIndex + 1 >= orderedSources.length) {
            loading = false;
            playbackError = true;
            playing = false;
            showControls();
            return;
        }

        resumeAt = video.currentTime || currentTime;
        resumePlayback = playing || (autoplay && autoplayAttempted);
        sourceIndex += 1;
        loading = true;
        buffered = 0;

        await tick();
        configureAudioDelay(true);
        resumeAudio();
        video.load();
    }

    function seek(event: Event) {
        const value = Number((event.currentTarget as HTMLInputElement).value);
        currentTime = value;
        if (!scrubbing) configureAudioDelay(true);
        video.currentTime = value;
    }

    function seekTo(seconds: number) {
        if (!Number.isFinite(duration)) return;

        const nextTime = Math.max(0, Math.min(duration, seconds));
        currentTime = nextTime;
        configureAudioDelay(true);
        video.currentTime = nextTime;
    }

    function seekBy(seconds: number) {
        seekTo(video.currentTime + seconds);
    }

    function changeVolumeBy(delta: number) {
        resumeAudio();
        const nextVolume = Math.max(0, Math.min(1, video.volume + delta));
        video.volume = nextVolume;
        video.muted = nextVolume === 0;
        if (nextVolume > 0) lastVolume = nextVolume;
    }

    function updateTimeline(event: PointerEvent, shouldSeek = scrubbing) {
        const input = event.currentTarget as HTMLInputElement;
        const bounds = input.getBoundingClientRect();
        if (!duration || !bounds.width) return;

        const ratio = Math.max(
            0,
            Math.min(1, (event.clientX - bounds.left) / bounds.width),
        );
        previewTime = ratio * duration;
        previewPosition = Math.max(
            previewEdgePadding,
            Math.min(bounds.width - previewEdgePadding, ratio * bounds.width),
        );

        if (shouldSeek) {
            currentTime = previewTime;
            video.currentTime = previewTime;
            showControls();
        }
    }

    function updateBuffered() {
        if (!video.buffered.length) {
            buffered = 0;
            return;
        }

        buffered = video.buffered.end(video.buffered.length - 1);
    }

    async function toggleFullscreen() {
        if (document.fullscreenElement === container) {
            await document.exitFullscreen();
        } else {
            await container.requestFullscreen();
        }
    }

    function handlePlayerClick(event: MouseEvent) {
        container.focus({ preventScroll: true });

        const target = event.target;
        if (
            target instanceof Element &&
            target.closest('button, input, select, textarea, a, [role="menu"]')
        ) {
            return;
        }

        togglePlayback();
        showControls();
    }

    function handlePlayerDoubleClick(event: MouseEvent) {
        const target = event.target;
        if (
            target instanceof Element &&
            target.closest('button, input, select, textarea, a, [role="menu"]')
        ) {
            return;
        }

        toggleFullscreen();
        showControls();
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.code === 'Escape' && settingsOpen) {
            event.preventDefault();
            if (settingsView === 'main') settingsOpen = false;
            else settingsView = 'main';
            showControls();
            return;
        }

        const target = event.target;
        if (
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            target instanceof HTMLButtonElement ||
            (target instanceof HTMLElement && target.isContentEditable)
        ) {
            return;
        }

        if (event.metaKey || event.ctrlKey || event.altKey) return;

        const digitMatch = /^(Digit|Numpad)(\d)$/.exec(event.code);

        if (event.code === 'Space' || event.code === 'KeyK') {
            event.preventDefault();
            togglePlayback();
        } else if (event.code === 'ArrowLeft' || event.code === 'KeyJ') {
            event.preventDefault();
            seekBy(-10);
        } else if (event.code === 'ArrowRight' || event.code === 'KeyL') {
            event.preventDefault();
            seekBy(10);
        } else if (event.code === 'Home') {
            event.preventDefault();
            seekTo(0);
        } else if (event.code === 'End') {
            event.preventDefault();
            seekTo(duration);
        } else if (event.code === 'ArrowUp') {
            event.preventDefault();
            changeVolumeBy(0.05);
        } else if (event.code === 'ArrowDown') {
            event.preventDefault();
            changeVolumeBy(-0.05);
        } else if (digitMatch) {
            event.preventDefault();
            seekTo((duration * Number(digitMatch[2])) / 10);
        } else if (event.code === 'KeyM') {
            event.preventDefault();
            toggleMute();
        } else if (event.code === 'KeyF') {
            event.preventDefault();
            toggleFullscreen();
        } else {
            return;
        }

        showControls();
    }

    function handlePointerMove(event: PointerEvent) {
        if (!container) return;

        const bounds = container.getBoundingClientRect();
        if (
            event.clientX >= bounds.left &&
            event.clientX <= bounds.right &&
            event.clientY >= bounds.top &&
            event.clientY <= bounds.bottom
        ) {
            showControls();
        }
    }

    onMount(() => {
        if (!sources[mode]?.length) {
            mode = availableAudioModes[0] ?? 'sub';
        }

        const stored = localStorage.getItem('arc:volume');
        const savedVolume = stored === null ? null : Number(stored);
        if (
            savedVolume !== null &&
            Number.isFinite(savedVolume) &&
            savedVolume >= 0 &&
            savedVolume <= 1
        ) {
            video.volume = savedVolume;
            if (savedVolume > 0) lastVolume = savedVolume;
        }

        const savedMode = localStorage.getItem('arc:audio-mode');
        if (
            (savedMode === 'sub' ||
                savedMode === 'dub' ||
                savedMode === 'raw') &&
            sources[savedMode]?.length
        ) {
            void switchMode(savedMode);
        }

        const savedAutoplay = localStorage.getItem('arc:autoplay');
        if (savedAutoplay === 'true' || savedAutoplay === 'false') {
            autoplay = savedAutoplay === 'true';
        }

        const savedQuality = localStorage.getItem('arc:quality');
        if (
            savedQuality === 'best' ||
            qualities.includes(savedQuality ?? '')
        ) {
            quality = savedQuality ?? 'best';
        }

        return () => {
            clearTimeout(hideControlsTimer);
            audioSource?.disconnect();
            audioDelayNode?.disconnect();
            void audioContext?.close();
        };
    });
</script>

<svelte:window
    onpointermove={handlePointerMove}
    onfullscreenchange={() => {
        fullscreen = document.fullscreenElement === container;
        showControls();
    }}
/>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
    bind:this={container}
    aria-label={`${label} player`}
    tabindex="-1"
    class:aspect-video={!fullscreen}
    class:cursor-none={playing && !controlsVisible}
    class:h-full={fullscreen}
    class="group relative w-full overflow-hidden bg-black focus:outline-none"
    onclick={handlePlayerClick}
    ondblclick={handlePlayerDoubleClick}
    onkeydown={handleKeydown}
>
    <video
        bind:this={video}
        class="size-full bg-black object-contain"
        playsinline
        preload="metadata"
        {poster}
        onloadstart={() => (loading = true)}
        onloadedmetadata={() => {
            duration = video.duration;
            loading = false;
            playbackError = false;
            configureAudioDelay(true);

            if (resumeAt !== null) {
                currentTime = Math.min(resumeAt, duration);
                video.currentTime = currentTime;
                resumeAt = null;

                if (resumePlayback) {
                    resumeAudio();
                    video.play().catch(() => undefined);
                }
                resumePlayback = false;
            } else if (!autoplayAttempted) {
                autoplayAttempted = true;
                if (autoplay) {
                    resumeAudio();
                    video.play().catch(() => {
                        video.muted = true;
                        video.play().catch(() => undefined);
                    });
                }
            }
        }}
        ondurationchange={() => (duration = video.duration)}
        ontimeupdate={() => (currentTime = video.currentTime)}
        onprogress={updateBuffered}
        onwaiting={() => (loading = true)}
        oncanplay={() => (loading = false)}
        onerror={() => void tryNextSource()}
        onplaying={() => {
            playing = true;
            loading = false;
            showControls();
        }}
        onpause={() => {
            playing = false;
            showControls();
        }}
        onended={() => {
            playing = false;
            showControls();
            if (autoplay && next) void goto(next);
        }}
        onvolumechange={() => {
            muted = video.muted || video.volume === 0;
            volume = video.volume;
            localStorage.setItem('arc:volume', String(video.volume));
        }}
    >
        <source {src} />
        <track kind="captions" />
    </video>

    {#if loading}
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

    {#if playbackError}
        <div
            role="alert"
            class="absolute inset-0 z-20 grid place-items-center bg-black px-6 text-center"
        >
            <div>
                <p class="text-base font-bold">This video could not be loaded.</p>
                <p class="mt-2 text-sm text-white/65">
                    Every available AllAnime source was tried.
                </p>
                <button
                    type="button"
                    class="mt-5 min-h-11 border border-white/60 px-5 text-sm font-bold hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    onclick={async () => {
                        sourceIndex = 0;
                        playbackError = false;
                        loading = true;
                        autoplayAttempted = false;
                        await tick();
                        video.load();
                    }}
                >
                    Try again
                </button>
            </div>
        </div>
    {/if}

    <div
        class:pointer-events-none={!controlsVisible && playing}
        class:opacity-0={!controlsVisible && playing}
        class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/45 to-transparent px-4 pt-16 pb-4 text-white transition-opacity duration-300 sm:px-6 sm:pb-5"
    >
        <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-4">
                <button
                    type="button"
                    aria-label={playing ? 'Pause' : 'Play'}
                    class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white"
                    onclick={() => {
                        togglePlayback();
                        showControls();
                    }}
                >
                    {#if playing}
                        <svg
                            class="size-6"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            aria-hidden="true"
                        >
                            <line x1="9" y1="6" x2="9" y2="18"></line>
                            <line x1="15" y1="6" x2="15" y2="18"></line>
                        </svg>
                    {:else}
                        <svg class="size-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M8 5v14l11-7z"></path>
                        </svg>
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
                                    style={`height: ${volumeProgress}%`}
                                ></span>
                                <span
                                    aria-hidden="true"
                                    class="absolute left-1/2 size-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow-sm ring-1 ring-black/10"
                                    style={`bottom: ${volumeProgress}%`}
                                ></span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={muted ? 0 : volume}
                                aria-label="Volume"
                                class="volume-input absolute inset-0 size-full cursor-pointer opacity-0"
                                oninput={changeVolume}
                            />
                        </div>
                    </div>
                    <button
                        type="button"
                        aria-label={muted ? 'Unmute' : 'Mute'}
                        class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white"
                        onclick={() => {
                            toggleMute();
                            showControls();
                        }}
                    >
                        {#if muted}
                            <svg
                                class="size-6"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-hidden="true"
                            >
                                <polygon points="5 10 9 10 13 6 13 18 9 14 5 14"></polygon>
                                <line x1="16" y1="9" x2="21" y2="15"></line>
                                <line x1="21" y1="9" x2="16" y2="15"></line>
                            </svg>
                        {:else}
                            <svg
                                class="size-6"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-hidden="true"
                            >
                                <polygon points="5 10 9 10 13 6 13 18 9 14 5 14"></polygon>
                                <path d="M16 9c1.3 1.3 1.3 4.7 0 6"></path>
                                <path d="M18.8 6.5c3 2.9 3 8.1 0 11"></path>
                            </svg>
                        {/if}
                    </button>
                </div>
            </div>

            <div class="flex items-center gap-4">
                <div class="relative">
                    <button
                        type="button"
                        aria-label="Playback settings"
                        aria-expanded={settingsOpen}
                        aria-controls="player-settings"
                        class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white"
                        onclick={() => {
                            if (!settingsOpen) settingsView = 'main';
                            settingsOpen = !settingsOpen;
                            showControls();
                        }}
                    >
                        <svg
                            class="size-6"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                        >
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.18V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0-1.18-2.82H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.08A1.65 1.65 0 0 0 10.09 3V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.08A1.65 1.65 0 0 0 21 10.09H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z"></path>
                        </svg>
                    </button>

                    {#if settingsOpen}
                        <div
                            id="player-settings"
                            role="menu"
                            aria-label="Playback settings"
                            class="absolute right-0 bottom-full z-40 mb-2 w-60 overflow-hidden bg-player-panel py-2 text-left text-xs shadow-xl ring-1 ring-white/8"
                        >
                            {#if settingsView === 'main'}
                                <button
                                    type="button"
                                    role="menuitemcheckbox"
                                    aria-checked={autoplay}
                                    class="flex min-h-8 w-full items-center justify-between px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                                    onclick={toggleAutoplay}
                                >
                                    <span>Autoplay</span>
                                    <span
                                        aria-hidden="true"
                                        class={`relative h-3.5 w-7 rounded-full border transition-colors ${
                                            autoplay
                                                ? 'border-player-accent bg-player-accent/20'
                                                : 'border-white/55 bg-white/12'
                                        }`}
                                    >
                                        <span
                                            class={`absolute top-0.5 left-0.5 size-2 rounded-full transition-all ${
                                                autoplay
                                                    ? 'translate-x-4 bg-player-accent'
                                                    : 'bg-white'
                                            }`}
                                        ></span>
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    role="menuitem"
                                    class="flex min-h-8 w-full items-center justify-between px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                                    onclick={() => (settingsView = 'audio')}
                                >
                                    <span>Audio</span>
                                    <span class="flex items-center gap-1 text-white/85">
                                        {audioLabel}
                                        <CaretRightIcon
                                            size="0.85rem"
                                            weight="bold"
                                            aria-hidden="true"
                                        />
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    role="menuitem"
                                    class="flex min-h-8 w-full items-center justify-between px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                                    onclick={() => (settingsView = 'quality')}
                                >
                                    <span>Quality</span>
                                    <span class="flex items-center gap-1 text-white/85">
                                        <span>{qualityLabel}</span>
                                        {#if isHdQuality(quality === 'best' ? bestQuality : quality)}
                                            <span class="font-bold text-accent">HD</span>
                                        {/if}
                                        <CaretRightIcon
                                            size="0.85rem"
                                            weight="bold"
                                            aria-hidden="true"
                                        />
                                    </span>
                                </button>
                            {:else}
                                <button
                                    type="button"
                                    role="menuitem"
                                    aria-label="Back to playback settings"
                                    class="flex min-h-8 w-full items-center gap-2 px-4 text-left text-xs font-bold hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                                    onclick={() => (settingsView = 'main')}
                                >
                                    <CaretLeftIcon
                                        size="0.95rem"
                                        weight="bold"
                                        aria-hidden="true"
                                    />
                                    {settingsView === 'quality' ? 'Quality' : 'Audio'}
                                </button>

                                {#if settingsView === 'quality'}
                                    <button
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={quality === 'best'}
                                        class="flex min-h-8 w-full items-center gap-2 px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                                        onclick={() => switchQuality('best')}
                                    >
                                        <span
                                            aria-hidden="true"
                                            class={`grid size-4 place-items-center rounded-full border ${
                                                quality === 'best'
                                                    ? 'border-player-accent'
                                                    : 'border-white/55'
                                            }`}
                                        >
                                            {#if quality === 'best'}
                                                <span class="leading-none text-player-accent" aria-hidden="true">•</span>
                                            {/if}
                                        </span>
                                        Auto
                                    </button>
                                    {#each qualities as option}
                                        <button
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={quality === option}
                                            class="flex min-h-8 w-full items-center gap-2 px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                                            onclick={() => switchQuality(option)}
                                        >
                                            <span
                                                aria-hidden="true"
                                                class={`grid size-4 place-items-center rounded-full border ${
                                                    quality === option
                                                        ? 'border-player-accent'
                                                        : 'border-white/55'
                                                }`}
                                            >
                                                {#if quality === option}
                                                    <span class="leading-none text-player-accent" aria-hidden="true">•</span>
                                                {/if}
                                            </span>
                                            <span>
                                                {option}
                                                {#if isHdQuality(option)}
                                                    <span class="font-bold text-accent">HD</span>
                                                {/if}
                                            </span>
                                        </button>
                                    {/each}
                                {:else}
                                    {#each availableAudioModes as option}
                                        <button
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={mode === option}
                                            class="flex min-h-8 w-full items-center gap-2 px-4 text-left font-medium hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none"
                                            onclick={() => switchMode(option)}
                                        >
                                            <span
                                                aria-hidden="true"
                                                class={`grid size-4 place-items-center rounded-full border ${
                                                    mode === option
                                                        ? 'border-player-accent'
                                                        : 'border-white/55'
                                                }`}
                                            >
                                                {#if mode === option}
                                                    <span class="leading-none text-player-accent" aria-hidden="true">•</span>
                                                {/if}
                                            </span>
                                            {option === 'dub'
                                                ? 'English'
                                                : option === 'raw'
                                                  ? 'Japanese (Raw)'
                                                  : 'Japanese'}
                                        </button>
                                    {/each}
                                {/if}
                            {/if}
                        </div>
                    {/if}
                </div>

                <button
                    type="button"
                    aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    class="grid size-8 place-items-center transition-opacity hover:opacity-75 focus-visible:outline-1 focus-visible:outline-white"
                    onclick={() => {
                        toggleFullscreen();
                        showControls();
                    }}
                >
                    <svg class="size-6" viewBox="0 0 240 240" aria-hidden="true">
                        <path
                            d="M143.7,53.9c-1.9-1.9-1.3-4,1.4-4.4l50.6-8.4c1.8-0.5,3.7,0.6,4.2,2.4c0.2,0.6,0.2,1.2,0,1.7l-8.4,50.6c-0.4,2.7-2.4,3.4-4.4,1.4l-14.5-14.5l-28.2,28.2l-14.3-14.3l28.2-28.2L143.7,53.9z M44.2,200.9l50.6-8.4c2.7-0.4,3.4-2.4,1.4-4.4l-14.5-14.5l28.2-28.2l-14.3-14.3l-28.2,28.2l-14.5-14.5c-1.9-1.9-4-1.3-4.4,1.4l-8.4,50.6c-0.5,1.8,0.6,3.6,2.4,4.2C43,201,43.6,201,44.2,200.9L44.2,200.9z"
                            fill="currentColor"
                        ></path>
                    </svg>
                </button>
            </div>
        </div>

        <div class="mt-2 flex items-center gap-3 px-1 text-xs font-medium sm:mt-3 sm:gap-4">
            <span class="w-18 shrink-0 pl-1 text-left whitespace-nowrap tabular-nums"
                >{formatTime(currentTime)}</span
            >
            <div class="group/timeline relative flex h-7 min-w-0 flex-1 items-center">
                {#if previewTime !== null}
                    <div
                        class="pointer-events-none absolute bottom-full z-30 mb-2 min-w-max -translate-x-1/2 bg-white px-2 py-1 text-xs font-bold whitespace-nowrap text-black shadow-md"
                        style={`left: ${previewPosition}px`}
                    >
                        {formatTime(previewTime)}
                        <span
                            class="absolute top-full left-1/2 size-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-white"
                            aria-hidden="true"
                        ></span>
                    </div>
                {/if}
                <div class="relative h-1 w-full bg-white/25 transition-all group-hover/timeline:h-1.5">
                    <span
                        class="absolute inset-y-0 left-0 bg-white/60"
                        style={`width: ${bufferedProgress}%`}
                        aria-hidden="true"
                    ></span>
                    <span
                        class="absolute inset-y-0 left-0 bg-accent"
                        style={`width: ${progress}%`}
                        aria-hidden="true"
                    ></span>
                    <span
                        class="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-sm ring-1 ring-white/30 transition-opacity group-hover/timeline:opacity-100"
                        style={`left: ${progress}%`}
                        aria-hidden="true"
                    ></span>
                </div>
                <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    step="0.1"
                    value={currentTime}
                    aria-label="Seek video"
                    class="absolute inset-0 z-20 cursor-pointer opacity-0"
                    oninput={seek}
                    onpointerdown={(event) => {
                        if (event.button !== 0) return;
                        scrubbing = true;
                        configureAudioDelay(true);
                        event.currentTarget.setPointerCapture(event.pointerId);
                        updateTimeline(event, true);
                        showControls();
                    }}
                    onpointermove={updateTimeline}
                    onpointerleave={() => {
                        if (!scrubbing) previewTime = null;
                    }}
                    onpointerup={(event) => {
                        updateTimeline(event, true);
                        scrubbing = false;
                        event.currentTarget.releasePointerCapture(event.pointerId);
                        container.focus({ preventScroll: true });
                        showControls();
                    }}
                    onpointercancel={() => {
                        scrubbing = false;
                        previewTime = null;
                    }}
                />
            </div>
            <span class="w-18 shrink-0 pr-1 text-right whitespace-nowrap tabular-nums"
                >{formatTime(duration)}</span
            >
        </div>
    </div>
</section>
