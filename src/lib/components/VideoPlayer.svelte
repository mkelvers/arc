<script lang="ts">
    import { onMount } from 'svelte';

    interface Props {
        src: string;
        label: string;
        poster?: string | null;
    }

    let { src, label, poster = null }: Props = $props();
    let container: HTMLElement;
    let video: HTMLVideoElement;
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
    let lastVolume = 1;
    let hideControlsTimer: ReturnType<typeof setTimeout>;

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

        if (playing && !scrubbing) {
            hideControlsTimer = setTimeout(() => {
                controlsVisible = false;
            }, 2_000);
        }
    }

    function togglePlayback() {
        if (video.paused) video.play().catch(() => undefined);
        else video.pause();
    }

    function toggleMute() {
        if (video.muted || video.volume === 0) {
            video.muted = false;
            video.volume = lastVolume;
        } else {
            lastVolume = video.volume;
            video.muted = true;
        }
    }

    function changeVolume(event: Event) {
        const value = Number((event.currentTarget as HTMLInputElement).value);
        video.volume = value;
        video.muted = value === 0;
        if (value > 0) lastVolume = value;
    }

    function seek(event: Event) {
        const value = Number((event.currentTarget as HTMLInputElement).value);
        currentTime = value;
        video.currentTime = value;
    }

    function seekTo(seconds: number) {
        if (!Number.isFinite(duration)) return;

        const nextTime = Math.max(0, Math.min(duration, seconds));
        currentTime = nextTime;
        video.currentTime = nextTime;
    }

    function seekBy(seconds: number) {
        seekTo(video.currentTime + seconds);
    }

    function changeVolumeBy(delta: number) {
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

    function handleKeydown(event: KeyboardEvent) {
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

        if (event.code === 'Space' || event.code === 'KeyK') {
            event.preventDefault();
            togglePlayback();
        } else if (event.code === 'ArrowLeft' || event.code === 'KeyJ') {
            event.preventDefault();
            seekBy(-10);
        } else if (event.code === 'ArrowRight' || event.code === 'KeyL') {
            event.preventDefault();
            seekBy(10);
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
        const stored = localStorage.getItem('player-volume');
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

        return () => clearTimeout(hideControlsTimer);
    });
</script>

<svelte:window
    onkeydown={handleKeydown}
    onpointermove={handlePointerMove}
    onfullscreenchange={() => {
        fullscreen = document.fullscreenElement === container;
        showControls();
    }}
/>

<section
    bind:this={container}
    aria-label={`${label} player`}
    class:aspect-video={!fullscreen}
    class:cursor-none={playing && !controlsVisible}
    class:h-full={fullscreen}
    class="group relative w-full overflow-hidden bg-black"
>
    <video
        bind:this={video}
        class="size-full bg-black object-contain"
        playsinline
        preload="metadata"
        {poster}
        onclick={togglePlayback}
        ondblclick={toggleFullscreen}
        onloadstart={() => (loading = true)}
        onloadedmetadata={() => {
            duration = video.duration;
            loading = false;
        }}
        ondurationchange={() => (duration = video.duration)}
        ontimeupdate={() => (currentTime = video.currentTime)}
        onprogress={updateBuffered}
        onwaiting={() => (loading = true)}
        oncanplay={() => (loading = false)}
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
        }}
        onvolumechange={() => {
            muted = video.muted || video.volume === 0;
            volume = video.volume;
            localStorage.setItem('player-volume', String(video.volume));
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
            <div
                class="size-10 animate-spin rounded-full border-4 border-accent border-t-transparent"
                aria-hidden="true"
            ></div>
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
                            <div class="relative mx-auto h-full w-1.5 rounded-full bg-white/35 shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
                                <div
                                    class="absolute inset-x-0 bottom-0 rounded-full bg-accent"
                                    style={`height: ${volumeProgress}%`}
                                ></div>
                                <div
                                    class="absolute left-1/2 size-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.45)] ring-1 ring-black/10"
                                    style={`bottom: ${volumeProgress}%`}
                                ></div>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={muted ? 0 : volume}
                                aria-label="Volume"
                                class="absolute inset-0 size-full cursor-pointer opacity-0"
                                style="writing-mode: vertical-lr; direction: rtl;"
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
                    <div
                        class="absolute inset-y-0 left-0 bg-white/60"
                        style={`width: ${bufferedProgress}%`}
                    ></div>
                    <div
                        class="absolute inset-y-0 left-0 bg-accent"
                        style={`width: ${progress}%`}
                    ></div>
                    <div
                        class="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-sm ring-1 ring-white/30 transition-opacity group-hover/timeline:opacity-100"
                        style={`left: ${progress}%`}
                    ></div>
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
