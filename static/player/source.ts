import { state } from "./state";
import { safeLocalStorage } from "./storage";
import { isRecord, parseModeSources, parseSegments } from "./validate";
import { loadVideoSource } from "./video";

export const streamUrlForMode = (mode: string, quality?: string): string => {
  const src = state.playback.modeSources[mode];
  if (!src?.token) {
    return "";
  }

  let url = `${state.playback.streamURL}?mode=${encodeURIComponent(mode)}&token=${encodeURIComponent(src.token)}`;
  if (src.type === "m3u8") {
    url += "&hls=1";
  }
  if (quality && quality !== "best") {
    url += `&quality=${encodeURIComponent(quality)}`;
  }

  return url;
};

const loadCurrentModeSource = async (
  signal: AbortSignal | undefined,
  forceRefresh: boolean,
): Promise<boolean> => {
  const mode = state.playback.currentMode;
  const res = await fetch(
    `/api/watch/episode/${state.episode.malID}/${encodeURIComponent(state.episode.current)}?mode=${encodeURIComponent(mode)}${forceRefresh ? "&refresh=1" : ""}`,
    { signal },
  );
  if (!res.ok) {
    throw new Error(`mode source refresh failed with status ${res.status}`);
  }

  const data: unknown = await res.json();
  if (!isRecord(data)) {
    return false;
  }

  const sources = parseModeSources(data.mode_sources);
  const initialMode = typeof data.initial_mode === "string" ? data.initial_mode : "";
  let selectedMode = Object.keys(sources).find((candidate) => sources[candidate]?.token) ?? "";
  if (sources[initialMode]?.token) {
    selectedMode = initialMode;
  }
  if (sources[mode]?.token) {
    selectedMode = mode;
  }
  const source = sources[selectedMode];
  if (!source?.token) {
    return false;
  }

  state.playback.modeSources = { ...state.playback.modeSources, ...sources };
  state.playback.currentMode = selectedMode;
  state.playback.modeSwitchedFrom =
    typeof data.mode_switched_from === "string" ? data.mode_switched_from : "";
  const startTime = Number(data.start_time_seconds);
  if (Number.isFinite(startTime) && startTime > 0) {
    state.playback.startTimeSeconds = startTime;
  }
  state.skip.parsedSegments = parseSegments(data.segments);

  const preferredQuality = safeLocalStorage.getItem("mal:preferred-quality") || "best";
  loadVideoSource(streamUrlForMode(selectedMode, preferredQuality), source.type);
  return true;
};

export const resolveCurrentModeSource = (signal?: AbortSignal): Promise<boolean> =>
  loadCurrentModeSource(signal, false);

export const refreshCurrentModeSource = (signal?: AbortSignal): Promise<boolean> =>
  loadCurrentModeSource(signal, true);
