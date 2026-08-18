import { goto } from '$app/navigation';
import type { AudioMode } from '$lib/audio';
import type HlsType from 'hls.js';
import { tick } from 'svelte';
import { AudioDelay } from './audio';
import { Captions } from './captions.svelte';
import {
    availableModes,
    hasSubtitleTrack,
    isHlsSource,
    orderStreams,
    streamsFor,
    subtitlesAt,
    type Sources,
    type Stream,
    type SubtitleMode,
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
    iframeEnabled = $state(false);
    hlsQualities = $state<HlsQuality[]>([]);
    hlsCurrentQuality = $state<string | null>(null);
    sourceIndex = $state(0);
    error = $state(false);
    video!: HTMLVideoElement;
    scrubbing = false;
    readonly captions = new Captions();

    private lastVolume = 1;
    private resumeAt: number | null = null;
    private resumePlayback = false;
    private autoplayAttempted = false;
    private changingSource = false;
    private pendingSourceFailure: string | null = null;
    private sourceChain: Stream[] = [];
    private hls: HlsType | null = null;
    private sourceWatchdog: ReturnType<typeof setTimeout> | undefined;
    private readonly audio = new AudioDelay();

    private allSources: Sources;

    constructor(
        sources: Sources,
        private next: string | null
    ) {
        this.allSources = sources;
        this.sources = sources;
    }

    private sources: Sources;

    private applySourcePreference() {
        this.sources = Object.fromEntries(
            Object.entries(this.allSources).map(([mode, streams]) => [
                mode,
                this.iframeEnabled
                    ? streams
                    : streams?.filter((stream) => stream.kind !== 'iframe'),
            ])
        );
    }

    sync(sources: Sources, next: string | null) {
        this.allSources = sources;
        this.applySourcePreference();
        this.next = next;
    }

    private get modeSources() {
        return streamsFor(this.sources, this.mode);
    }

    private get preferredSources() {
        const ordered = orderStreams(this.modeSources, this.quality);
        if (!this.captions.enabled) {
            return ordered;
        }

        const captioned = ordered.filter((stream) =>
            hasSubtitleTrack(this.sources, this.mode, stream)
        );
        return captioned.length
            ? [...captioned, ...ordered.filter((stream) => !captioned.includes(stream))]
            : ordered;
    }

    private get activeSources() {
        return this.sourceChain.length ? this.sourceChain : this.preferredSources;
    }

    get qualities() {
        return this.hlsQualities.length
            ? this.hlsQualities.map(({ label }) => label)
            : this.modeSources
                  .map(({ quality }) => quality)
                  .filter(
                      (quality, index, qualities): quality is string =>
                          Boolean(quality) && qualities.indexOf(quality) === index
                  );
    }

    get src() {
        return this.activeSources[this.sourceIndex]?.url ?? '';
    }

    get sourceKind() {
        return this.activeSources[this.sourceIndex]?.kind ?? 'direct';
    }

    get audioDelay() {
        return this.activeSources[this.sourceIndex]?.audioDelay ?? 0;
    }

    get subtitles() {
        return subtitlesAt(this.captions.cues, this.currentTime);
    }

    get bestQuality() {
        return this.hlsCurrentQuality ?? this.activeSources[this.sourceIndex]?.quality ?? null;
    }

    get audioModes() {
        return availableModes(this.sources);
    }

    get qualityText() {
        return this.quality === 'best'
            ? this.bestQuality
                ? `Auto ${this.bestQuality}`
                : 'Auto'
            : this.quality;
    }

    syncAudio(reset = false) {
        this.audio.sync(this.video, this.audioDelay, reset);
    }

    setScrubbing(active: boolean) {
        this.scrubbing = active;

        if (active) {
            this.syncAudio(true);
        }
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
        this.setVolume(Math.max(0, Math.min(1, this.video.volume + delta)));
    }

    toggleAutoplay() {
        this.autoplay = !this.autoplay;
        preferences.save('autoplay', this.autoplay);
    }

    async toggleIframes() {
        this.iframeEnabled = !this.iframeEnabled;
        preferences.save('iframes', this.iframeEnabled);
        this.applySourcePreference();
        this.resetSource();
        await this.reloadSource();
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
        this.captions.clear();
        this.watchSource();
        this.syncAudio(true);
        this.resumeAudio();
        video.removeAttribute('src');
        video.load();

        if (!source) {
            return;
        }

        if (this.sourceKind === 'iframe') {
            this.loading = false;
            return;
        }

        void this.captions.load(
            this.sources,
            this.mode,
            this.activeSources[this.sourceIndex],
            source
        );

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
                            values.findIndex(({ label }) => label === quality.label) === index
                    )
                    .toSorted(
                        (left, right) => Number.parseInt(right.label) - Number.parseInt(left.label)
                    );
                this.hlsQualities = qualities;

                const selected = qualities.find(({ label }) => label === this.quality);
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
                    this.hlsQualities.find(({ level }) => level === data.level)?.label ?? null;
            });
            hls.on(Hls.Events.ERROR, (_event, data) => {
                if (this.hls !== hls || !data.fatal) {
                    return;
                }

                if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMediaError) {
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
            return;
        }

        this.rememberPlayback();
        this.mode = mode;

        this.resetSource();
        preferences.save('audio-mode', mode);
        await this.reloadSource();
    }

    async switchQuality(quality: string) {
        if (quality === this.quality) {
            return;
        }

        const hlsQuality = this.hlsQualities.find(({ label }) => label === quality);
        if (this.hls && (quality === 'best' || hlsQuality)) {
            this.quality = quality;
            this.hls.currentLevel = hlsQuality?.level ?? -1;
            preferences.save('quality', quality);
            return;
        }

        this.rememberPlayback();
        this.quality = quality;
        this.resetSource();
        preferences.save('quality', quality);
        await this.reloadSource();
    }

    switchSubtitleMode(mode: SubtitleMode) {
        const selection = this.captions.select(mode);
        if (selection === 'done') {
            return;
        }

        const current = this.activeSources[this.sourceIndex];
        if (selection === 'reevaluate-source') {
            const preferred = this.preferredSources[0];
            if (preferred && preferred !== current) {
                this.rememberPlayback();
                this.resetSource();
                void this.reloadSource();
                return;
            }
        }

        if (this.src) {
            void this.captions.load(this.sources, this.mode, current, this.src);
        }
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
            this.captions.clear();
            this.destroyHls();
            this.loading = false;
            this.error = true;
            this.playing = false;
            this.changingSource = false;
            return;
        }

        this.resumeAt = this.video.currentTime || this.currentTime;
        this.resumePlayback = this.playing || (this.autoplay && this.autoplayAttempted);
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

        if (!this.scrubbing) {
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

        if (!this.autoplayAttempted && Number.isFinite(startAt) && startAt > 0) {
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
    }

    updateBuffered() {
        if (!this.video.buffered.length) {
            this.buffered = 0;
            return;
        }

        this.buffered = this.video.buffered.end(this.video.buffered.length - 1);
    }

    async retry() {
        this.resetSource();
        this.autoplayAttempted = false;
        await this.reloadSource();
    }

    async changeEpisode() {
        this.clearSourceWatchdog();
        this.captions.clear();
        this.destroyHls();
        this.audio.sync(this.video, 0, true);

        this.resumeAt = null;
        this.resumePlayback = false;
        this.autoplayAttempted = false;
        this.changingSource = false;
        this.pendingSourceFailure = null;
        this.currentTime = 0;
        this.duration = 0;
        this.buffered = 0;
        this.playing = false;
        this.loading = true;
        this.error = false;

        if (!this.sources[this.mode]?.length) {
            this.mode = this.audioModes[0] ?? 'sub';
        }

        this.resetSource();
        await this.reloadSource();
    }

    ended() {
        this.playing = false;

        if (this.autoplay && this.next) {
            void goto(this.next);
        }
    }

    volumeChanged() {
        this.muted = this.video.muted || this.video.volume === 0;
        this.volume = this.video.volume;
        preferences.save('volume', this.video.volume);
    }

    mount() {
        const saved = preferences.load(this.sources, this.qualities);
        this.iframeEnabled = saved.iframes ?? false;
        this.applySourcePreference();

        if (!this.sources[this.mode]?.length) {
            this.mode = this.audioModes[0] ?? 'sub';
        }

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

        if (saved.subtitleEnabled !== null) {
            this.captions.enabled = saved.subtitleEnabled;
            if (!saved.subtitleEnabled) {
                this.captions.mode = 'off';
            }
        }
        if (saved.subtitleMode !== null) {
            this.captions.mode = saved.subtitleMode;
        }
        if (saved.subtitleSize !== null) {
            this.captions.size = saved.subtitleSize;
        }
        if (saved.subtitleTextColor !== null) {
            this.captions.textColor = saved.subtitleTextColor;
        }
        if (saved.subtitleBackground !== null) {
            this.captions.background = saved.subtitleBackground;
        }
        if (saved.subtitleBackgroundOpacity !== null) {
            this.captions.backgroundOpacity = saved.subtitleBackgroundOpacity;
        }
        if (saved.subtitleEdgeStyle !== null) {
            this.captions.edgeStyle = saved.subtitleEdgeStyle;
        }

        this.resetSource();
        void this.reloadSource();

        return () => {
            this.clearSourceWatchdog();
            this.captions.clear();
            this.destroyHls();
            this.audio.close();
        };
    }
}
