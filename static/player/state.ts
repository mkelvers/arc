import type { ModeSource, SkipSegment, SubtitleCue, SubtitleTrack, ActiveSegment } from "./types";
import { parseModeSources, parseSegments } from "./validate";
import { q, qs, dataset } from "../q";
import { safeLocalStorage } from "./storage";

export interface PlayerState {
  elements: {
    container: HTMLElement;
    video: HTMLVideoElement;
    progress: HTMLElement;
    scrubber: HTMLElement;
    buffered: HTMLElement;
    timeDisplay: HTMLElement;
    durationDisplay: HTMLElement;
    episodeGrid: HTMLElement | null;
    episodeList: HTMLElement | null;
    previewPopover: HTMLElement | null;
    previewTime: HTMLElement | null;
    videoOverlay: HTMLElement | null;
  };
  playback: {
    modeSources: Record<string, ModeSource>;
    readonly availableModes: string[];
    currentMode: string;
    modeSwitchedFrom: string;
    streamURL: string;
    initialStreamToken: string;
    startTimeSeconds: number;
    shouldAutoPlay: boolean;
    lastKnownVolume: number;
    pendingSeekTime: number | null;
  };
  episode: {
    current: string;
    total: number;
    isAiring: boolean;
    malID: number;
    transitionEpisode: number | null;
    completionSent: boolean;
    completionAttempts: number;
    endedProgressSaved: boolean;
    lastSavedProgress: { episode: string; seconds: number };
  };
  skip: {
    parsedSegments: SkipSegment[];
    activeSegments: ActiveSegment[];
    activeSegment: ActiveSegment | null;
  };
  subtitles: {
    activeCues: SubtitleCue[];
    tracks: SubtitleTrack[];
  };
  ui: {
    isScrubbing: boolean;
    isFullscreen: boolean;
  };
  timers: {
    playerControlsTimeout: number | undefined;
    progressSaveTimer: number | undefined;
  };
}

const createInitialState = (): PlayerState => ({
  elements: {
    container: document.createElement("div"),
    video: document.createElement("video"),
    progress: document.createElement("div"),
    scrubber: document.createElement("div"),
    buffered: document.createElement("div"),
    timeDisplay: document.createElement("div"),
    durationDisplay: document.createElement("div"),
    episodeGrid: null,
    episodeList: null,
    previewPopover: null,
    previewTime: null,
    videoOverlay: null,
  },
  playback: {
    modeSources: {},
    get availableModes() {
      return Object.keys(this.modeSources);
    },
    currentMode: "dub",
    modeSwitchedFrom: "",
    streamURL: "/watch/proxy/stream",
    initialStreamToken: "",
    startTimeSeconds: 0,
    shouldAutoPlay: false,
    lastKnownVolume: 1,
    pendingSeekTime: null,
  },
  episode: {
    current: "1",
    total: 0,
    isAiring: false,
    malID: 0,
    transitionEpisode: null,
    completionSent: false,
    completionAttempts: 0,
    endedProgressSaved: false,
    lastSavedProgress: { episode: "1", seconds: -1 },
  },
  skip: {
    parsedSegments: [],
    activeSegments: [],
    activeSegment: null,
  },
  subtitles: {
    activeCues: [],
    tracks: [],
  },
  ui: {
    isScrubbing: false,
    isFullscreen: false,
  },
  timers: {
    playerControlsTimeout: undefined,
    progressSaveTimer: undefined,
  },
});

export const state: PlayerState = createInitialState();

export const showEndState = (): void => {
  state.elements.container.classList.add("video-ended");
  state.elements.video.pause();
};

export const hideEndState = (): void => {
  state.elements.container.classList.remove("video-ended");
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
  state.elements.container = c;
  state.elements.video = elements.video;
  state.elements.progress = elements.progress;
  state.elements.scrubber = elements.scrubber;
  state.elements.buffered = elements.buffered;
  state.elements.timeDisplay = elements.timeDisplay;
  state.elements.durationDisplay = elements.durationDisplay;
  state.elements.previewPopover = q<HTMLElement>(c, "[data-preview-popover]");
  state.elements.previewTime = q<HTMLElement>(c, "[data-preview-time]");
  state.elements.videoOverlay = q<HTMLElement>(c, "[data-video-overlay]");

  // data attributes from server
  state.episode.malID = Number.parseInt(dataset(c, "malId"), 10);
  state.episode.current = dataset(c, "currentEpisode") || "1";

  state.episode.total = Number.parseInt(dataset(c, "totalEpisodes"), 10);
  state.episode.isAiring = dataset(c, "isAiring") === "true";
  state.playback.streamURL = dataset(c, "streamUrl") || "/watch/proxy/stream";
  state.playback.initialStreamToken = dataset(c, "streamToken") || "";
  state.playback.startTimeSeconds = Number.parseFloat(dataset(c, "startTimeSeconds") || "0") || 0;
  // from session: previous page set this when autoplay triggered
  state.playback.shouldAutoPlay = sessionStorage.getItem("mal:autoplay-next") === "true";
  sessionStorage.removeItem("mal:autoplay-next");

  // global elements (not inside player container)
  state.elements.episodeGrid = qs<HTMLElement>("[data-episode-grid]");
  state.elements.episodeList = qs<HTMLElement>("[data-episode-list]");

  const safeJsonUnknown = (raw: string | undefined): unknown => {
    try {
      return JSON.parse(raw ?? "");
    } catch (error) {
      console.error("failed to parse json:", error);
      return null;
    }
  };

  // mode sources = { sub: { token, subtitles, qualities }, dub: { ... } }
  state.playback.modeSources = parseModeSources(safeJsonUnknown(dataset(c, "modeSources")));

  // resolve initial mode: localStorage > backend default > first available > 'dub'
  const backendInitialMode = dataset(c, "initialMode") || "dub";
  state.playback.modeSwitchedFrom = dataset(c, "modeSwitchedFrom") || "";
  const storedMode = safeLocalStorage.getItem("player-audio-mode");
  const initialMode =
    storedMode && state.playback.availableModes.includes(storedMode)
      ? storedMode
      : backendInitialMode;
  const fallbackMode = Object.keys(state.playback.modeSources).find(
    (m) => state.playback.modeSources[m]?.token,
  );
  state.playback.currentMode = state.playback.modeSources[initialMode]?.token
    ? initialMode
    : (fallbackMode ?? state.playback.availableModes[0] ?? "dub");

  // If the inline template script already set a video src, prefer deriving the mode from it.
  // This avoids mismatches where the UI highlights one mode but the video is actually playing the other.
  const deriveModeFromVideoSrc = (): string | null => {
    const raw = state.elements.video.currentSrc || state.elements.video.src;
    if (!raw) return null;
    try {
      const u = new URL(raw, window.location.href);
      const modeParam = u.searchParams.get("mode");
      if (modeParam === "sub" || modeParam === "dub") return modeParam;
      return null;
    } catch (error) {
      console.error("failed to parse mode url:", error);
      return null;
    }
  };

  const modeFromVideo = deriveModeFromVideoSrc();
  if (
    modeFromVideo &&
    modeFromVideo !== state.playback.currentMode &&
    state.playback.availableModes.includes(modeFromVideo) &&
    state.playback.modeSources[modeFromVideo]?.token
  ) {
    state.playback.currentMode = modeFromVideo;
  }

  // parse skip segments from data attribute
  const segments = parseSegments(safeJsonUnknown(dataset(c, "segments")));
  state.skip.parsedSegments = segments
    .map((s) => ({ ...s, start: Number(s.start) || 0, end: Number(s.end) || 0 }))
    .filter((s) => s.end > s.start);

  return true;
};
