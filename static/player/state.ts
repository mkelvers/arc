import { ModeSource, SkipSegment, SubtitleCue, SubtitleTrack, ActiveSegment } from './types';
import { q, qs, dataset } from '../q';

export interface PlayerState {
  container: HTMLElement;
  video: HTMLVideoElement;
  progress: HTMLElement;
  scrubber: HTMLElement;
  buffered: HTMLElement;
  timeDisplay: HTMLElement;
  durationDisplay: HTMLElement;
  modeSources: Record<string, ModeSource>;
  availableModes: string[];
  currentMode: string;
  currentEpisode: string;
  totalEpisodes: number;
  malID: number;
  streamURL: string;
  initialStreamToken: string;
  startTimeSeconds: number;
  shouldAutoPlay: boolean;
  parsedSegments: SkipSegment[];
  activeSegments: ActiveSegment[];
  activeSkipSegment: ActiveSegment | null;
  activeSubtitles: SubtitleCue[];
  currentSubtitleTracks: SubtitleTrack[];
  lastKnownVolume: number;
  pendingSeekTime: number | null;
  isScrubbing: boolean;
  isFullscreen: boolean;
  playerControlsTimeout: number | undefined;
  progressSaveTimer: number | undefined;
  transitionEpisode: number | null;
  completionSent: boolean;
  completionAttempts: number;
  lastSavedProgress: { episode: string; seconds: number };
  episodeGrid: HTMLElement | null;
  episodeList: HTMLElement | null;
  previewPopover: HTMLElement | null;
  previewTime: HTMLElement | null;
  videoOverlay: HTMLElement | null;
}

export const state: PlayerState = {
  container: null as unknown as HTMLElement,
  video: null as unknown as HTMLVideoElement,
  progress: null as unknown as HTMLElement,
  scrubber: null as unknown as HTMLElement,
  buffered: null as unknown as HTMLElement,
  timeDisplay: null as unknown as HTMLElement,
  durationDisplay: null as unknown as HTMLElement,
  modeSources: {},
  availableModes: [],
  currentMode: 'dub',
  currentEpisode: '1',
  totalEpisodes: 0,
  malID: 0,
  streamURL: '/watch/proxy/stream',
  initialStreamToken: '',
  startTimeSeconds: 0,
  shouldAutoPlay: false,
  parsedSegments: [],
  activeSegments: [],
  activeSkipSegment: null,
  activeSubtitles: [],
  currentSubtitleTracks: [],
  lastKnownVolume: 1,
  pendingSeekTime: null,
  isScrubbing: false,
  isFullscreen: false,
  playerControlsTimeout: undefined,
  progressSaveTimer: undefined,
  transitionEpisode: null,
  completionSent: false,
  completionAttempts: 0,
  lastSavedProgress: { episode: '1', seconds: -1 },
  episodeGrid: null,
  episodeList: null,
  previewPopover: null,
  previewTime: null,
  videoOverlay: null,
};

/**
 * Initializes player state from DOM data attributes.
 * Called once on page load or htmx swap.
 */
export const initState = (c: HTMLElement): void => {
  // core elements
  state.container = c;
  state.video = q<HTMLVideoElement>(c, 'video')!;
  state.progress = q<HTMLElement>(c, '[data-progress]');
  state.scrubber = q<HTMLElement>(c, '[data-scrubber]');
  state.buffered = q<HTMLElement>(c, '[data-buffered]');
  state.timeDisplay = q<HTMLElement>(c, '[data-time]');
  state.durationDisplay = q<HTMLElement>(c, '[data-duration]');
  state.previewPopover = q<HTMLElement>(c, '[data-preview-popover]');
  state.previewTime = q<HTMLElement>(c, '[data-preview-time]');
  state.videoOverlay = q<HTMLElement>(c, '[data-video-overlay]');

  // data attributes from server
  state.malID = Number.parseInt(dataset(c, 'malId'), 10);
  state.currentEpisode = dataset(c, 'currentEpisode') || '1';
  state.totalEpisodes = Number.parseInt(dataset(c, 'totalEpisodes'), 10);
  state.streamURL = dataset(c, 'streamUrl') || '/watch/proxy/stream';
  state.initialStreamToken = dataset(c, 'streamToken') || '';
  state.startTimeSeconds = Number.parseFloat(dataset(c, 'startTimeSeconds') || '0') || 0;
  // from session: previous page set this when autoplay triggered
  state.shouldAutoPlay = sessionStorage.getItem('mal:autoplay-next') === 'true';
  sessionStorage.removeItem('mal:autoplay-next');

  // global elements (not inside player container)
  state.episodeGrid = qs<HTMLElement>('[data-episode-grid]');
  state.episodeList = qs<HTMLElement>('[data-episode-list]');

  const safeJson = <T>(raw: string | undefined, fallback: T): T => {
    try {
      return JSON.parse(raw ?? '') as T;
    } catch {
      return fallback;
    }
  };

  // mode sources = { sub: { token, subtitles, qualities }, dub: { ... } }
  state.modeSources = safeJson(dataset(c, 'modeSources'), {} as Record<string, ModeSource>);
  state.availableModes = safeJson(dataset(c, 'availableModes'), [] as string[]);

  // resolve initial mode: localStorage > backend default > first available > 'dub'
  const backendInitialMode = dataset(c, 'initialMode') || 'dub';
  const storedMode = localStorage.getItem('player-audio-mode');
  const initialMode =
    storedMode && state.availableModes.includes(storedMode) ? storedMode : backendInitialMode;
  const fallbackMode = Object.keys(state.modeSources).find(m => state.modeSources[m]?.token);
  state.currentMode = state.modeSources[initialMode]?.token
    ? initialMode
    : (fallbackMode ?? state.availableModes[0] ?? 'dub');

  // parse skip segments from data attribute
  const segments = safeJson(dataset(c, 'segments'), [] as SkipSegment[]);
  state.parsedSegments = segments
    .map(s => ({ ...s, start: Number(s.start) || 0, end: Number(s.end) || 0 }))
    .filter(s => s.end > s.start);
};
