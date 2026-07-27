import { goto } from '$app/navigation';
import type { AudioMode } from '$lib/anime/audio';
import { tick } from 'svelte';
import { AudioDelay } from './audio';
import {
    availableModes,
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

    private async reloadSource() {
        await tick();
        this.syncAudio(true);
        this.resumeAudio();
        this.video.load();
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
        if (this.sourceIndex + 1 >= this.orderedSources.length) {
            this.loading = false;
            this.error = true;
            this.playing = false;
            this.onActivity();
            return;
        }

        this.resumeAt = this.video.currentTime || this.currentTime;
        this.resumePlayback =
            this.playing || (this.autoplay && this.autoplayAttempted);
        this.sourceIndex += 1;
        this.loading = true;
        this.buffered = 0;
        await this.reloadSource();
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
        this.duration = this.video.duration;
        this.loading = false;
        this.error = false;
        this.syncAudio(true);

        if (this.resumeAt !== null) {
            this.currentTime = Math.min(this.resumeAt, this.duration);
            this.video.currentTime = this.currentTime;
            this.resumeAt = null;

            if (this.resumePlayback) {
                this.resumeAudio();
                this.video.play().catch(() => undefined);
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
        this.video.play().catch(() => {
            this.video.muted = true;
            this.video.play().catch(() => undefined);
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
        await tick();
        this.video.load();
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
        let reload = false;

        if (saved.volume !== null) {
            this.video.volume = saved.volume;

            if (saved.volume > 0) {
                this.lastVolume = saved.volume;
            }
        }

        if (saved.mode && saved.mode !== this.mode) {
            this.mode = saved.mode;
            reload = true;
        }

        if (saved.autoplay !== null) {
            this.autoplay = saved.autoplay;
        }

        if (saved.quality && saved.quality !== this.quality) {
            this.quality = saved.quality;
            reload = true;
        }

        if (reload) {
            void tick().then(() => this.video.load());
        }

        return () => this.audio.close();
    }
}
