import { goto } from '$app/navigation';
import type { AudioMode } from '$lib/anime/audio';
import type HlsType from 'hls.js';
import { tick } from 'svelte';
import { AudioDelay } from './audio';
import {
    availableModes,
    isHlsSource,
    orderStreams,
    parseWebVtt,
    qualitiesFor,
    qualityLabel,
    streamsFor,
    subtitlesAt,
    type Sources,
    type Stream,
    type SubtitleCue,
} from './media';
import * as preferences from './preferences';

interface HlsQuality {
    label: string;
    level: number;
}

export class Playback {
    mode = $state<AudioMode>('sub');
    playing = $state(false);
    muted = $state(false);
    loading = $state(true);
    currentTime = $state(0);
    duration = $state(0);
    buffered = $state(0);
    volume = $state(1);
    autoplay = $state(true);
    quality = $state('best');
    hlsQualities = $state<HlsQuality[]>([]);
    hlsCurrentQuality = $state<string | null>(null);
    subtitleCues = $state<SubtitleCue[]>([]);
    sourceIndex = $state(0);
    error = $state(false);
    video!: HTMLVideoElement;

    private lastVolume = 1;
    private resumeAt: number | null = null;
    private resumePlayback = false;
    private autoplayAttempted = false;
    private changingSource = false;
    private pendingSourceFailure: string | null = null;
    private sourceChain: Stream[] = [];
    private hls: HlsType | null = null;
    private subtitleRequest: AbortController | null = null;
    private sourceWatchdog: ReturnType<typeof setTimeout> | undefined;
    private readonly audio = new AudioDelay();

    constructor(
        private readonly readSources: () => Sources,
        private readonly readNext: () => string | null,
        private readonly isScrubbing: () => boolean,
        private readonly onActivity: () => void,
    ) {}

    private get sources() {
        return this.readSources();
    }

    private get modeSources() {
        return streamsFor(this.sources, this.mode);
    }

    private get preferredSources() {
        return orderStreams(this.modeSources, this.quality);
    }

    private get activeSources() {
        return this.sourceChain.length
            ? this.sourceChain
            : this.preferredSources;
    }

    get qualities() {
        return this.hlsQualities.length
            ? this.hlsQualities.map(({ label }) => label)
            : qualitiesFor(this.modeSources);
    }

    get src() {
        return this.activeSources[this.sourceIndex]?.url ?? '';
    }

    get audioDelay() {
        return this.activeSources[this.sourceIndex]?.audioDelay ?? 0;
    }

    get subtitleUrl() {
        return (
            this.activeSources[this.sourceIndex]?.subtitleUrl ?? null
        );
    }

    get subtitles() {
        return subtitlesAt(this.subtitleCues, this.currentTime);
    }

    get bestQuality() {
        return (
            this.hlsCurrentQuality ??
            this.activeSources[this.sourceIndex]?.quality ??
            null
        );
    }

    get audioModes() {
        return availableModes(this.sources);
    }

    get qualityText() {
        return qualityLabel(this.quality, this.bestQuality);
    }

    get volumeProgress() {
        return (this.muted ? 0 : this.volume) * 100;
    }

    syncAudio(reset = false) {
        this.audio.sync(this.video, this.audioDelay, reset);
    }

    private resumeAudio() {
        this.audio.resume(this.video, this.audioDelay);
    }

    togglePlayback() {
        if (this.video.paused) {
            this.resumeAudio();
            this.video.play().catch(() => undefined);
            return;
        }

        this.video.pause();
    }

    toggleMute() {
        this.resumeAudio();

        if (this.video.muted || this.video.volume === 0) {
            this.video.muted = false;
            this.video.volume = this.lastVolume;
            return;
        }

        this.lastVolume = this.video.volume;
        this.video.muted = true;
    }

    setVolume(value: number) {
        this.resumeAudio();
        this.video.volume = value;
        this.video.muted = value === 0;

        if (value > 0) {
            this.lastVolume = value;
        }
    }

    changeVolume(delta: number) {
        this.setVolume(
            Math.max(0, Math.min(1, this.video.volume + delta)),
        );
    }

    toggleAutoplay() {
        this.autoplay = !this.autoplay;
        preferences.save('autoplay', this.autoplay);
        this.onActivity();
    }

    private rememberPlayback() {
        this.resumeAt = this.video.currentTime;
        this.resumePlayback = !this.video.paused;
    }

    private resetSource() {
        this.sourceChain = this.preferredSources;
        this.sourceIndex = 0;
        this.pendingSourceFailure = null;
        this.error = false;
        this.loading = true;
        this.buffered = 0;
    }

    private destroyHls() {
        this.hls?.destroy();
        this.hls = null;
        this.hlsQualities = [];
        this.hlsCurrentQuality = null;
    }

    private clearSubtitles() {
        this.subtitleRequest?.abort();
        this.subtitleRequest = null;
        this.subtitleCues = [];
    }

    private async loadSubtitles(source: string, subtitleUrl: string) {
        this.clearSubtitles();
        const request = new AbortController();
        this.subtitleRequest = request;

        try {
            const response = await fetch(subtitleUrl, {
                signal: request.signal,
            });
            if (!response.ok) {
                throw new Error(
                    `Subtitle request failed with ${response.status}`,
                );
            }

            const cues = parseWebVtt(await response.text());
            if (!cues.length) {
                throw new Error('Subtitle response had no valid cues');
            }
            if (this.subtitleRequest === request && source === this.src) {
                this.subtitleCues = cues;
            }
        } catch (cause) {
            if (
                request.signal.aborted ||
                this.subtitleRequest !== request ||
                source !== this.src
            ) {
                return;
            }

            console.error('Subtitle source failed', cause);
            void this.tryNextSource(source);
        }
    }

    private clearSourceWatchdog() {
        clearTimeout(this.sourceWatchdog);
        this.sourceWatchdog = undefined;
    }

    private watchSource() {
        this.clearSourceWatchdog();
        const source = this.src;
        if (!source) {
            return;
        }

        this.sourceWatchdog = setTimeout(() => {
            if (source === this.src && this.loading) {
                void this.tryNextSource(source);
            }
        }, 15_000);
    }

    private async reloadSource() {
        const source = this.src;
        await tick();
        const video = this.video;
        if (!video || source !== this.src) {
            return;
        }

        this.destroyHls();
        this.clearSubtitles();
        this.watchSource();
        this.syncAudio(true);
        this.resumeAudio();
        video.removeAttribute('src');
        video.load();

        if (!source) {
            return;
        }

        const subtitleUrl = this.subtitleUrl;
        if (subtitleUrl) {
            void this.loadSubtitles(source, subtitleUrl);
        }

        if (!isHlsSource(source)) {
            video.src = source;
            video.load();
            return;
        }

        const { default: Hls } = await import('hls.js');
        if (video !== this.video || source !== this.src) {
            return;
        }
        if (Hls.isSupported()) {
            const hls = new Hls();
            let recoveredMediaError = false;
            this.hls = hls;
            hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
                if (this.hls !== hls) {
                    return;
                }

                const qualities = data.levels
                    .map((level, index) => ({
                        label: level.height > 0 ? `${level.height}p` : '',
                        level: index,
                    }))
                    .filter(
                        (quality, index, values) =>
                            quality.label &&
                            values.findIndex(
                                ({ label }) => label === quality.label,
                            ) === index,
                    )
                    .toSorted(
                        (left, right) =>
                            Number.parseInt(right.label) -
                            Number.parseInt(left.label),
                    );
                this.hlsQualities = qualities;

                const selected = qualities.find(
                    ({ label }) => label === this.quality,
                );
                if (this.quality === 'best') {
                    hls.currentLevel = -1;
                } else if (selected) {
                    hls.currentLevel = selected.level;
                } else {
                    this.quality = 'best';
                    preferences.save('quality', 'best');
                    hls.currentLevel = -1;
                }
            });
            hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
                if (this.hls !== hls) {
                    return;
                }

                this.hlsCurrentQuality =
                    this.hlsQualities.find(({ level }) => level === data.level)
                        ?.label ?? null;
            });
            hls.on(Hls.Events.ERROR, (_event, data) => {
                if (this.hls !== hls || !data.fatal) {
                    return;
                }

                if (
                    data.type === Hls.ErrorTypes.MEDIA_ERROR &&
                    !recoveredMediaError
                ) {
                    recoveredMediaError = true;
                    hls.recoverMediaError();
                    return;
                }

                void this.tryNextSource(source);
            });
            hls.loadSource(source);
            hls.attachMedia(video);
            return;
        }

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = source;
            video.load();
            return;
        }

        await this.tryNextSource(source);
    }

    async switchMode(mode: AudioMode) {
        if (!this.sources[mode] || mode === this.mode) {
            this.onActivity();
            return;
        }

        this.rememberPlayback();
        this.mode = mode;

        this.resetSource();
        preferences.save('audio-mode', mode);
        await this.reloadSource();
        this.onActivity();
    }

    async switchQuality(quality: string) {
        if (quality === this.quality) {
            this.onActivity();
            return;
        }

        const hlsQuality = this.hlsQualities.find(
            ({ label }) => label === quality,
        );
        if (this.hls && (quality === 'best' || hlsQuality)) {
            this.quality = quality;
            this.hls.currentLevel = quality === 'best' ? -1 : hlsQuality!.level;
            preferences.save('quality', quality);
            this.onActivity();
            return;
        }

        this.rememberPlayback();
        this.quality = quality;
        this.resetSource();
        preferences.save('quality', quality);
        await this.reloadSource();
        this.onActivity();
    }

    async tryNextSource(failedSource = this.src) {
        if (failedSource !== this.src) {
            return;
        }
        if (this.changingSource) {
            this.pendingSourceFailure = failedSource;
            return;
        }
        this.changingSource = true;

        if (this.sourceIndex + 1 >= this.activeSources.length) {
            this.pendingSourceFailure = null;
            this.clearSourceWatchdog();
            this.clearSubtitles();
            this.destroyHls();
            this.loading = false;
            this.error = true;
            this.playing = false;
            this.changingSource = false;
            this.onActivity();
            return;
        }

        this.resumeAt = this.video.currentTime || this.currentTime;
        this.resumePlayback =
            this.playing || (this.autoplay && this.autoplayAttempted);
        this.sourceIndex += 1;
        this.loading = true;
        this.buffered = 0;
        try {
            await this.reloadSource();
        } finally {
            this.changingSource = false;
            const pending = this.pendingSourceFailure;
            this.pendingSourceFailure = null;
            if (pending === this.src) {
                void this.tryNextSource(pending);
            }
        }
    }

    seek(seconds: number) {
        if (!Number.isFinite(this.duration)) {
            return;
        }

        const time = Math.max(0, Math.min(this.duration, seconds));
        this.currentTime = time;

        if (!this.isScrubbing()) {
            this.syncAudio(true);
        }

        this.video.currentTime = time;
    }

    handleMetadata(startAt = 0) {
        const video = this.video;
        this.duration = video.duration;
        this.error = false;
        this.syncAudio(true);

        if (this.resumeAt !== null) {
            this.currentTime = Math.min(this.resumeAt, this.duration);
            video.currentTime = this.currentTime;
            this.resumeAt = null;

            if (this.resumePlayback) {
                this.resumeAudio();
                video.play().catch(() => undefined);
            }

            this.resumePlayback = false;
            return;
        }

        if (
            !this.autoplayAttempted &&
            Number.isFinite(startAt) &&
            startAt > 0
        ) {
            this.currentTime = Math.min(startAt, this.duration);
            video.currentTime = this.currentTime;
        }

        if (this.autoplayAttempted) {
            return;
        }

        this.autoplayAttempted = true;
        if (!this.autoplay) {
            return;
        }

        this.resumeAudio();
        video.play().catch(() => {
            if (this.video !== video) {
                return;
            }

            video.muted = true;
            video.play().catch(() => undefined);
        });
    }

    handleWaiting() {
        this.loading = true;
        this.watchSource();
    }

    handleCanPlay() {
        this.loading = false;
        this.clearSourceWatchdog();
    }

    handlePlaying() {
        this.playing = true;
        this.loading = false;
        this.clearSourceWatchdog();
        this.onActivity();
    }

    updateBuffered() {
        if (!this.video.buffered.length) {
            this.buffered = 0;
            return;
        }

        this.buffered = this.video.buffered.end(
            this.video.buffered.length - 1,
        );
    }

    async retry() {
        this.resetSource();
        this.autoplayAttempted = false;
        await this.reloadSource();
    }

    ended() {
        this.playing = false;
        this.onActivity();

        const next = this.readNext();
        if (this.autoplay && next) {
            void goto(next);
        }
    }

    volumeChanged() {
        this.muted = this.video.muted || this.video.volume === 0;
        this.volume = this.video.volume;
        preferences.save('volume', this.video.volume);
    }

    mount() {
        if (!this.sources[this.mode]?.length) {
            this.mode = this.audioModes[0] ?? 'sub';
        }

        const saved = preferences.load(this.sources, this.qualities);
        if (saved.volume !== null) {
            this.video.volume = saved.volume;

            if (saved.volume > 0) {
                this.lastVolume = saved.volume;
            }
        }

        if (saved.mode && saved.mode !== this.mode) {
            this.mode = saved.mode;
        }

        if (saved.autoplay !== null) {
            this.autoplay = saved.autoplay;
        }

        if (saved.quality && saved.quality !== this.quality) {
            this.quality = saved.quality;
        }

        this.resetSource();
        void this.reloadSource();

        return () => {
            this.clearSourceWatchdog();
            this.clearSubtitles();
            this.destroyHls();
            this.audio.close();
        };
    }
}
