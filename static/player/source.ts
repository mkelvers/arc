import { state } from "./state";
import { safeLocalStorage } from "./storage";
import { isRecord, parseModeSources } from "./validate";
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

export const refreshCurrentModeSource = async (signal?: AbortSignal): Promise<boolean> => {
  const mode = state.playback.currentMode;
  const res = await fetch(
    `/api/watch/episode/${state.episode.malID}/${encodeURIComponent(state.episode.current)}?mode=${encodeURIComponent(mode)}`,
    { signal },
  );
  if (!res.ok) {
    throw new Error(`mode source refresh failed with status ${res.status}`);
  }

  const data: unknown = await res.json();
  if (!isRecord(data)) {
    return false;
  }

  const refreshedSource = parseModeSources(data.mode_sources)[mode];
  if (!refreshedSource?.token) {
    return false;
  }

  state.playback.modeSources = { ...state.playback.modeSources, [mode]: refreshedSource };

  const preferredQuality = safeLocalStorage.getItem("mal:preferred-quality") || "best";
  loadVideoSource(streamUrlForMode(mode, preferredQuality), refreshedSource.type);
  return true;
};
