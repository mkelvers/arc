import { goto } from '$app/navigation';
import type { AudioMode } from '$lib/anime/audio';
import type HlsType from 'hls.js';
import { tick } from 'svelte';
import { AudioDelay } from './audio';
import {
    availableModes,
    isHlsSource,
    orderStreams,
    qualitiesFor,
    qualityLabel,
    streamsFor,
    type Sources,
} from './media';
import * as preferences from './preferences';

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
    sourceIndex = $state(0);
    error = $state(false);
    video!: HTMLVideoElement;

    private lastVolume = 1;
    private resumeAt: number | null = null;
    private resumePlayback = false;
    private autoplayAttempted = false;
    private changingSource = false;
    private hls: HlsType | null = null;
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

    private get orderedSources() {
        return orderStreams(this.modeSources, this.quality);
    }

    get qualities() {
        return qualitiesFor(this.modeSources);
    }

    get src() {
        return this.orderedSources[this.sourceIndex]?.url ?? '';
    }

    get audioDelay() {
        return this.orderedSources[this.sourceIndex]?.audioDelay ?? 0;
    }

    get subtitleUrl() {
        return (
            this.orderedSources[this.sourceIndex]?.subtitleUrl ?? null
        );
    }

    get bestQuality() {
        return this.modeSources[0]?.quality ?? null;
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
        this.sourceIndex = 0;
        this.error = false;
        this.loading = true;
        this.buffered = 0;
    }

    private destroyHls() {
        this.hls?.destroy();
        this.hls = null;
    }

    private async reloadSource() {
        const source = this.src;
        await tick();
        const video = this.video;
        if (!video || source !== this.src) {
            return;
        }

        this.destroyHls();
        this.syncAudio(true);
        this.resumeAudio();
        video.removeAttribute('src');
        video.load();

        if (!source) {
            return;
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

                void this.tryNextSource();
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

        this.changingSource = false;
        await this.tryNextSource();
    }

    async switchMode(mode: AudioMode) {
        if (!this.sources[mode] || mode === this.mode) {
            this.onActivity();
            return;
        }

        this.rememberPlayback();
        this.mode = mode;

        if (
            this.quality !== 'best' &&
            !this.sources[mode]?.some(
                ({ quality }) => quality === this.quality,
            )
        ) {
            this.quality = 'best';
            preferences.save('quality', this.quality);
        }

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

        this.rememberPlayback();
        this.quality = quality;
        this.resetSource();
        preferences.save('quality', quality);
        await this.reloadSource();
        this.onActivity();
    }

    async tryNextSource() {
        if (this.changingSource) {
            return;
        }
        this.changingSource = true;

        if (this.sourceIndex + 1 >= this.orderedSources.length) {
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

    handleMetadata() {
        const video = this.video;
        this.changingSource = false;
        this.duration = video.duration;
        this.loading = false;
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

        void this.reloadSource();

        return () => {
            this.destroyHls();
            this.audio.close();
        };
    }
}
