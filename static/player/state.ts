import type { ModeSource, SkipSegment, SubtitleCue, SubtitleTrack, ActiveSegment } from "./types";
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
  availableModes: string[];
  currentMode: string;
  modeSwitchedFrom: string;
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

const createInitialState = (): PlayerState => ({
  container: document.createElement("div"),
  video: document.createElement("video"),
  progress: document.createElement("div"),
  scrubber: document.createElement("div"),
  buffered: document.createElement("div"),
  timeDisplay: document.createElement("div"),
  durationDisplay: document.createElement("div"),
  modeSources: {},
  availableModes: [],
  currentMode: "dub",
  modeSwitchedFrom: "",
  currentEpisode: "1",
  totalEpisodes: 0,
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
  lastSavedProgress: { episode: "1", seconds: -1 },
  episodeGrid: null,
  episodeList: null,
  previewPopover: null,
  previewTime: null,
  videoOverlay: null,
});

export const state: PlayerState = createInitialState();

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

  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

  const isStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((item) => typeof item === "string");

  const isSubtitleItemArray = (v: unknown): v is { lang: string; token: string }[] =>
    Array.isArray(v) &&
    v.every(
      (item) => isRecord(item) && typeof item.lang === "string" && typeof item.token === "string",
    );

  const parseModeSources = (v: unknown): Record<string, ModeSource> => {
    if (!isRecord(v)) return {};
    const out: Record<string, ModeSource> = {};
    for (const [key, value] of Object.entries(v)) {
      if (!isRecord(value)) continue;
      if (typeof value.token !== "string" || value.token === "") continue;
      if (!isSubtitleItemArray(value.subtitles)) continue;
      const qualities = value.qualities;
      out[key] = {
        token: value.token,
        subtitles: value.subtitles,
        qualities: isStringArray(qualities) ? qualities : undefined,
      };
    }
    return out;
  };

  const parseAvailableModes = (v: unknown): string[] => (isStringArray(v) ? v : []);

  const parseSegments = (v: unknown): SkipSegment[] => {
    if (!Array.isArray(v)) return [];
    const out: SkipSegment[] = [];
    for (const item of v) {
      if (!isRecord(item)) continue;
      const type = typeof item.type === "string" ? item.type : "";
      const start = typeof item.start === "number" ? item.start : Number(item.start);
      const end = typeof item.end === "number" ? item.end : Number(item.end);
      const source = typeof item.source === "string" ? item.source : undefined;
      if (!type || !Number.isFinite(start) || !Number.isFinite(end)) continue;
      out.push({ type, start, end, source });
    }
    return out;
  };

  // mode sources = { sub: { token, subtitles, qualities }, dub: { ... } }
  state.modeSources = parseModeSources(safeJsonUnknown(dataset(c, "modeSources")));
  state.availableModes = parseAvailableModes(safeJsonUnknown(dataset(c, "availableModes")));

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

  // parse skip segments from data attribute
  const segments = parseSegments(safeJsonUnknown(dataset(c, "segments")));
  state.parsedSegments = segments
    .map((s) => ({ ...s, start: Number(s.start) || 0, end: Number(s.end) || 0 }))
    .filter((s) => s.end > s.start);

  return true;
};
