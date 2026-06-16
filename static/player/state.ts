import type { ModeSource, SkipSegment, SubtitleCue, SubtitleTrack, ActiveSegment } from "./types";
import { parseModeSources, parseSegments } from "./validate";
import { q, qs, dataset } from "../q";
import { safeLocalStorage } from "./storage";

export interface PlayerState {
  container: HTMLElement;
  video: HTMLVideoElement;
  progress: HTMLElement;
  scrubber: HTMLElement;
  buffered: HTMLElement;
  timeDisplay: HTMLElement;
  durationDisplay: HTMLElement;
  modeSources: Record<string, ModeSource>;
  readonly availableModes: string[];
  currentMode: string;
  modeSwitchedFrom: string;
  currentEpisode: string;
  totalEpisodes: number;
  isAiring: boolean;
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
  endedProgressSaved: boolean;
  lastSavedProgress: { episode: string; seconds: number };
  episodeGrid: HTMLElement | null;
  episodeList: HTMLElement | null;
  previewPopover: HTMLElement | null;
  previewTime: HTMLElement | null;
  videoOverlay: HTMLElement | null;
}

const createInitialState = (): PlayerState => ({
  container: document.createElement("div"),
  video: document.createElement("video"),
  progress: document.createElement("div"),
  scrubber: document.createElement("div"),
  buffered: document.createElement("div"),
  timeDisplay: document.createElement("div"),
  durationDisplay: document.createElement("div"),
  modeSources: {},
  get availableModes() {
    return Object.keys(this.modeSources);
  },
  currentMode: "dub",
  modeSwitchedFrom: "",
  currentEpisode: "1",
  totalEpisodes: 0,
  isAiring: false,
  malID: 0,
  streamURL: "/watch/proxy/stream",
  initialStreamToken: "",
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
  endedProgressSaved: false,
  lastSavedProgress: { episode: "1", seconds: -1 },
  episodeGrid: null,
  episodeList: null,
  previewPopover: null,
  previewTime: null,
  videoOverlay: null,
});

export const state: PlayerState = createInitialState();

export const showEndState = (): void => {
  state.container.classList.add("video-ended");
  state.video.pause();
};

export const hideEndState = (): void => {
  state.container.classList.remove("video-ended");
};

interface RequiredPlayerElements {
  video: HTMLVideoElement;
  progress: HTMLElement;
  scrubber: HTMLElement;
  buffered: HTMLElement;
  timeDisplay: HTMLElement;
  durationDisplay: HTMLElement;
}

const findElement = <T extends Element>(
  container: HTMLElement,
  selector: string,
  elementType: new () => T,
): T | null => {
  const element = container.querySelector(selector);
  if (element instanceof elementType) return element;
  return null;
};

const requiredPlayerElements = (container: HTMLElement): RequiredPlayerElements | null => {
  const video = findElement(container, "video", HTMLVideoElement);
  const progress = findElement(container, "[data-progress]", HTMLElement);
  const scrubber = findElement(container, "[data-scrubber]", HTMLElement);
  const buffered = findElement(container, "[data-buffered]", HTMLElement);
  const timeDisplay = findElement(container, "[data-time]", HTMLElement);
  const durationDisplay = findElement(container, "[data-duration]", HTMLElement);

  if (!video || !progress || !scrubber || !buffered || !timeDisplay || !durationDisplay) {
    return null;
  }

  return { video, progress, scrubber, buffered, timeDisplay, durationDisplay };
};

/**
 * Initializes player state from DOM data attributes.
 * Called once on page load or htmx swap.
 */
export const initState = (c: HTMLElement): boolean => {
  const elements = requiredPlayerElements(c);
  if (!elements) return false;

  // core elements
  state.container = c;
  state.video = elements.video;
  state.progress = elements.progress;
  state.scrubber = elements.scrubber;
  state.buffered = elements.buffered;
  state.timeDisplay = elements.timeDisplay;
  state.durationDisplay = elements.durationDisplay;
  state.previewPopover = q<HTMLElement>(c, "[data-preview-popover]");
  state.previewTime = q<HTMLElement>(c, "[data-preview-time]");
  state.videoOverlay = q<HTMLElement>(c, "[data-video-overlay]");

  // data attributes from server
  state.malID = Number.parseInt(dataset(c, "malId"), 10);
  state.currentEpisode = dataset(c, "currentEpisode") || "1";

  state.totalEpisodes = Number.parseInt(dataset(c, "totalEpisodes"), 10);
  state.isAiring = dataset(c, "isAiring") === "true";
  state.streamURL = dataset(c, "streamUrl") || "/watch/proxy/stream";
  state.initialStreamToken = dataset(c, "streamToken") || "";
  state.startTimeSeconds = Number.parseFloat(dataset(c, "startTimeSeconds") || "0") || 0;
  // from session: previous page set this when autoplay triggered
  state.shouldAutoPlay = sessionStorage.getItem("mal:autoplay-next") === "true";
  sessionStorage.removeItem("mal:autoplay-next");

  // global elements (not inside player container)
  state.episodeGrid = qs<HTMLElement>("[data-episode-grid]");
  state.episodeList = qs<HTMLElement>("[data-episode-list]");

  const safeJsonUnknown = (raw: string | undefined): unknown => {
    try {
      return JSON.parse(raw ?? "");
    } catch {
      return null;
    }
  };

  // mode sources = { sub: { token, subtitles, qualities }, dub: { ... } }
  state.modeSources = parseModeSources(safeJsonUnknown(dataset(c, "modeSources")));

  // resolve initial mode: localStorage > backend default > first available > 'dub'
  const backendInitialMode = dataset(c, "initialMode") || "dub";
  state.modeSwitchedFrom = dataset(c, "modeSwitchedFrom") || "";
  const storedMode = safeLocalStorage.getItem("player-audio-mode");
  const initialMode =
    storedMode && state.availableModes.includes(storedMode) ? storedMode : backendInitialMode;
  const fallbackMode = Object.keys(state.modeSources).find((m) => state.modeSources[m]?.token);
  state.currentMode = state.modeSources[initialMode]?.token
    ? initialMode
    : (fallbackMode ?? state.availableModes[0] ?? "dub");

  // If the inline template script already set a video src, prefer deriving the mode from it.
  // This avoids mismatches where the UI highlights one mode but the video is actually playing the other.
  const deriveModeFromVideoSrc = (): string | null => {
    const raw = state.video.currentSrc || state.video.src;
    if (!raw) return null;
    try {
      const u = new URL(raw, window.location.href);
      const modeParam = u.searchParams.get("mode");
      if (modeParam === "sub" || modeParam === "dub") return modeParam;
      return null;
    } catch {
      return null;
    }
  };

  const modeFromVideo = deriveModeFromVideoSrc();
  if (
    modeFromVideo &&
    modeFromVideo !== state.currentMode &&
    state.availableModes.includes(modeFromVideo) &&
    state.modeSources[modeFromVideo]?.token
  ) {
    state.currentMode = modeFromVideo;
  }

  // parse skip segments from data attribute
  const segments = parseSegments(safeJsonUnknown(dataset(c, "segments")));
  state.parsedSegments = segments
    .map((s) => ({ ...s, start: Number(s.start) || 0, end: Number(s.end) || 0 }))
    .filter((s) => s.end > s.start);

  return true;
};
