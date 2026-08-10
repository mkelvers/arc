import { goto } from '$app/navigation';
import type { AudioMode } from '$lib/anime/audio';
import type HlsType from 'hls.js';
import { tick } from 'svelte';
import { AudioDelay } from './audio';
import {
  alignSubtitleCues,
  availableModes,
  hasDialogueCoverage,
  hasSubtitleTrack,
  hlsTimeline,
  hlsTimelineOffsets,
  isHlsSource,
  orderStreams,
  parseWebVtt,
  qualitiesFor,
  qualityLabel,
  sameSubtitleCues,
  streamsFor,
  subtitleOptionsFor,
  subtitleReferenceTracks,
  subtitleTracks,
  subtitlesAt,
  type Sources,
  type Stream,
  type SubtitleCue,
  type SubtitleKind,
  type SubtitleMode,
  type SubtitleOption,
  type SubtitleSize,
  type SubtitleTrack,
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
  subtitleMode = $state<SubtitleMode>('dub');
  subtitleOptions = $state<SubtitleOption[]>(subtitleOptionsFor([]));
  subtitleSize = $state<SubtitleSize>('normal');
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
  private subtitlesEnabled = $state(true);
  private loadedSubtitles: Partial<Record<Exclude<SubtitleMode, 'off'>, SubtitleCue[]>> = {};
  private hls: HlsType | null = null;
  private subtitleRequest: AbortController | null = null;
  private sourceWatchdog: ReturnType<typeof setTimeout> | undefined;
  private readonly audio = new AudioDelay();

  constructor(
    private readonly readSources: () => Sources,
    private readonly readNext: () => string | null,
    private readonly isScrubbing: () => boolean,
    private readonly onActivity: () => void
  ) {}

  private get sources() {
    return this.readSources();
  }

  private get modeSources() {
    return streamsFor(this.sources, this.mode);
  }

  private get preferredSources() {
    const ordered = orderStreams(this.modeSources, this.quality);
    if (!this.subtitlesEnabled) {
      return ordered;
    }

    const captioned = ordered.filter((stream) => hasSubtitleTrack(this.sources, this.mode, stream));
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
    return this.hlsCurrentQuality ?? this.activeSources[this.sourceIndex]?.quality ?? null;
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
    this.setVolume(Math.max(0, Math.min(1, this.video.volume + delta)));
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
    this.loadedSubtitles = {};
    this.subtitleOptions = subtitleOptionsFor([]);
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

  private async fetchHlsTimeline(source: string, signal: AbortSignal) {
    if (!isHlsSource(source)) {
      return null;
    }

    const response = await fetch(source, { signal });
    if (!response.ok) {
      return null;
    }

    let timeline = hlsTimeline(await response.text());
    if (!timeline.variant) {
      return timeline.boundaries;
    }

    const base = response.url || new URL(source, location.href).toString();
    const variant = await fetch(new URL(timeline.variant, base), { signal });
    if (!variant.ok) {
      return null;
    }

    timeline = hlsTimeline(await variant.text());
    return timeline.boundaries;
  }

  private async subtitleOffsets(reference: Stream, target: Stream, signal: AbortSignal) {
    if (reference.url === target.url) {
      return [{ at: 0, offset: 0 }];
    }

    const [referenceTimeline, targetTimeline] = await Promise.all([
      this.fetchHlsTimeline(reference.url, signal),
      this.fetchHlsTimeline(target.url, signal),
    ]);
    return referenceTimeline && targetTimeline
      ? hlsTimelineOffsets(referenceTimeline, targetTimeline)
      : null;
  }

  private async fallbackSubtitleOffsets(
    primary: SubtitleTrack,
    target: Stream,
    cues: SubtitleCue[],
    signal: AbortSignal
  ) {
    const offsets = await this.subtitleOffsets(primary.source, target, signal);
    if (offsets?.length) {
      return offsets;
    }

    const loaded = new Map<string, SubtitleCue[] | null>();
    loaded.set(primary.url, cues);
    for (const reference of subtitleReferenceTracks(this.sources, primary)) {
      let referenceCues = loaded.get(reference.url);
      if (referenceCues === undefined) {
        referenceCues = await this.fetchSubtitleCues(reference.url, signal);
        loaded.set(reference.url, referenceCues);
      }
      if (!referenceCues || !sameSubtitleCues(cues, referenceCues)) {
        continue;
      }

      const alternative = await this.subtitleOffsets(reference.source, target, signal);
      if (alternative?.length) {
        return alternative;
      }
    }

    return null;
  }

  /** The best caption track among the ones available, mirroring the old
   * single-choice preference: dialogue CC, then translation, then signs. */
  private defaultSubtitleKind(kinds: SubtitleKind[]) {
    if (kinds.includes('cc')) {
      return 'cc';
    }
    if (kinds.includes('translated')) {
      return 'translated';
    }
    if (kinds.includes('limited')) {
      return 'limited';
    }
    return null;
  }

  private offerAvailableSubtitles() {
    const source = this.modeSources.find((candidate) =>
      hasSubtitleTrack(this.sources, this.mode, candidate)
    );
    const tracks = subtitleTracks(this.sources, this.mode, source);
    const kinds: SubtitleKind[] = [];
    if (this.mode === 'dub') {
      if (tracks.own) {
        kinds.push('limited');
      }
      if (tracks.sub) {
        kinds.push('translated');
      }
    } else if (tracks.own) {
      kinds.push('translated');
    }
    this.subtitleOptions = subtitleOptionsFor(kinds);
    this.subtitleMode = 'off';
  }

  private async loadSubtitles(source: string) {
    this.clearSubtitles();
    const request = new AbortController();
    this.subtitleRequest = request;
    const active = this.activeSources[this.sourceIndex];
    const { own, sub } = subtitleTracks(this.sources, this.mode, active);
    const stale = () =>
      request.signal.aborted || this.subtitleRequest !== request || source !== this.src;

    if (!active || (!own && !sub)) {
      this.offerAvailableSubtitles();
      return;
    }

    try {
      const ownRequest = own
        ? this.fetchSubtitleCues(own.url, request.signal)
        : Promise.resolve(null);
      const subRequest =
        sub && sub.url !== own?.url ? this.fetchSubtitleCues(sub.url, request.signal) : ownRequest;
      const [ownCues, subCues] = await Promise.all([ownRequest, subRequest]);

      if (stale()) {
        return;
      }

      const kinds: SubtitleKind[] = [];

      // The active encode's own track is dub CC (or signs) on a dub and
      // the translated dialogue on a sub/raw encode.
      if (ownCues) {
        const kind =
          this.mode === 'dub'
            ? hasDialogueCoverage(ownCues.length, subCues?.length ?? 0)
              ? 'cc'
              : 'limited'
            : 'translated';
        this.loadedSubtitles[kind === 'translated' ? 'sub' : 'dub'] = ownCues;
        kinds.push(kind);
      }

      // Offer the provider's translated track as an alternative to
      // native dub captions when it can be calibrated to this encode.
      if (this.mode === 'dub' && sub && subCues) {
        const offsets = await this.fallbackSubtitleOffsets(sub, active, subCues, request.signal);
        if (stale()) {
          return;
        }
        if (offsets?.length) {
          this.loadedSubtitles.sub = alignSubtitleCues(subCues, offsets);
          if (!kinds.includes('translated')) {
            kinds.push('translated');
          }
        }
      }

      this.subtitleOptions = subtitleOptionsFor(kinds);
      const defaultKind = this.defaultSubtitleKind(kinds);
      if (this.subtitlesEnabled && defaultKind) {
        this.subtitleMode = defaultKind === 'translated' ? 'sub' : 'dub';
        this.subtitleCues = this.loadedSubtitles[this.subtitleMode] ?? [];
      } else {
        this.subtitleMode = 'off';
        this.subtitleCues = [];
      }

      if (!kinds.length) {
        console.warn('Subtitle track could not be loaded or aligned');
      }
    } catch (cause) {
      if (stale()) {
        return;
      }

      this.offerAvailableSubtitles();
      console.warn('Subtitle track could not be loaded or aligned', cause);
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
              quality.label && values.findIndex(({ label }) => label === quality.label) === index
          )
          .toSorted((left, right) => Number.parseInt(right.label) - Number.parseInt(left.label));
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

    const hlsQuality = this.hlsQualities.find(({ label }) => label === quality);
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
    const enabled = mode !== 'off';
    if (enabled === this.subtitlesEnabled && mode === this.subtitleMode) {
      this.onActivity();
      return;
    }

    const wasEnabled = this.subtitlesEnabled;
    this.subtitlesEnabled = enabled;
    this.subtitleMode = mode;
    preferences.save('subtitles', enabled);
    if (!enabled) {
      this.subtitleCues = [];
    } else if (this.loadedSubtitles[mode]) {
      this.subtitleCues = this.loadedSubtitles[mode];
    } else if (!wasEnabled && this.src) {
      const current = this.activeSources[this.sourceIndex];
      const preferred = this.preferredSources[0];
      if (preferred && preferred !== current) {
        this.rememberPlayback();
        this.resetSource();
        void this.reloadSource();
      } else {
        void this.loadSubtitles(this.src);
      }
    } else if (this.src) {
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
    this.onActivity();
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

    if (saved.subtitleEnabled !== null) {
      this.subtitlesEnabled = saved.subtitleEnabled;
      if (!saved.subtitleEnabled) {
        this.subtitleMode = 'off';
      }
    }
    if (saved.subtitleSize !== null) {
      this.subtitleSize = saved.subtitleSize;
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
