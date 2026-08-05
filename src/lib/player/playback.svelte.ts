import { goto } from '$app/navigation';
import type { AudioMode } from '$lib/anime/audio';
import type HlsType from 'hls.js';
import { tick } from 'svelte';
import { AudioDelay } from './audio';
import {
    alignSubtitleTracks,
    availableModes,
    dubCaptionTracks,
    isHlsSource,
    orderStreams,
    parseWebVtt,
    qualitiesFor,
    qualityLabel,
    streamsFor,
    subtitlesFor,
    subtitleTracks,
    subtitlesAt,
    type Sources,
    type Stream,
    type SubtitleCue,
    type SubtitleMode,
    type SubtitleSize,
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
    subtitleMode = $state<SubtitleMode>('merge');
    subtitleSize = $state<SubtitleSize>('normal');
    subtitleBackground = $state(true);
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

    private async fetchSubtitleCues(url: string, signal: AbortSignal) {
        try {
            const response = await fetch(url, { signal });
            if (!response.ok) {
                return null;
            }

            const cues = parseWebVtt(await response.text());
            return cues.length ? cues : null;
        } catch {
            return null;
        }
    }

    private async loadSubtitles(source: string) {
        this.clearSubtitles();
        const request = new AbortController();
        this.subtitleRequest = request;
        const active = this.activeSources[this.sourceIndex];
        const { own, sub } = subtitleTracks(this.sources, active);
        // Dub sources can ship different caption tracks (the fullest carries
        // the dialogue, others may be title cards only). While watching the
        // dub, load every track and prefer the fullest, so a missing or
        // brittle track on the active source still gets dialogue captions.
        const borrowed =
            this.mode === 'dub'
                ? dubCaptionTracks(this.sources).filter((url) => url !== own)
                : [];
        const stale = () =>
            request.signal.aborted ||
            this.subtitleRequest !== request ||
            source !== this.src;

        // A source without any caption track plays without subtitles; only a
        // track that exists but cannot be loaded is a source failure.
        if (!own && !sub && !borrowed.length) {
            return;
        }

        try {
            const ownCues = own
                ? await this.fetchSubtitleCues(own, request.signal)
                : null;
            const borrowedCues = (
                await Promise.all(
                    borrowed.map((url) =>
                        this.fetchSubtitleCues(url, request.signal),
                    ),
                )
            ).filter((cues): cues is SubtitleCue[] => cues !== null);
            const subCues =
                sub && sub !== own && !borrowed.includes(sub)
                    ? await this.fetchSubtitleCues(sub, request.signal)
                    : null;

            if (stale()) {
                return;
            }

            // Prefer the fullest dub track, keeping the active stream's own
            // on ties. Dub and sub versions of an episode are separate
            // encodes whose audio can sit offset from the shared video
            // timeline; the chosen dub track is anchored to the heard dub
            // audio, so shift the sub cues onto its timeline to keep merged
            // or sub-only captions in sync.
            let dubCues = ownCues;
            for (const cues of borrowedCues) {
                if (!dubCues || cues.length > dubCues.length) {
                    dubCues = cues;
                }
            }

            const alignedSub =
                dubCues && subCues
                    ? alignSubtitleTracks(dubCues, subCues)
                    : subCues;

            // Show the track(s) the subtitle preference asks for: the merge
            // keeps both with the dub track preferred, while 'dub' and 'sub'
            // show a single track and fall back to the other when theirs is
            // missing.
            const chosen = subtitlesFor(
                this.subtitleMode,
                dubCues,
                alignedSub,
            );
            if (chosen) {
                this.subtitleCues = chosen;
                return;
            }
            throw new Error('Subtitle sources returned no usable cues');
        } catch (cause) {
            if (stale()) {
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

        void this.loadSubtitles(source);

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

    switchSubtitleMode(mode: SubtitleMode) {
        if (mode === this.subtitleMode) {
            this.onActivity();
            return;
        }

        this.subtitleMode = mode;
        preferences.save('subtitles', mode);
        if (this.src) {
            void this.loadSubtitles(this.src);
        }
        this.onActivity();
    }

    switchSubtitleSize(size: SubtitleSize) {
        if (size === this.subtitleSize) {
            this.onActivity();
            return;
        }

        this.subtitleSize = size;
        preferences.save('subtitle-size', size);
        this.onActivity();
    }

    switchSubtitleBackground(enabled: boolean) {
        if (enabled === this.subtitleBackground) {
            this.onActivity();
            return;
        }

        this.subtitleBackground = enabled;
        preferences.save('subtitle-background', enabled);
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

    async changeEpisode() {
        this.clearSourceWatchdog();
        this.clearSubtitles();
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

        if (saved.subtitleMode) {
            this.subtitleMode = saved.subtitleMode;
        }
        if (saved.subtitleSize) {
            this.subtitleSize = saved.subtitleSize;
        }
        if (saved.subtitleBackground !== null) {
            this.subtitleBackground = saved.subtitleBackground;
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
