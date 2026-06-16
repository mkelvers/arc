import { state } from "./state";

export const streamUrlForMode = (mode: string, quality?: string): string => {
  const src = state.playback.modeSources[mode];
  if (!src?.token) return "";

  let url = `${state.playback.streamURL}?mode=${encodeURIComponent(mode)}&token=${encodeURIComponent(src.token)}`;
  if (src.type === "m3u8") {
    url += "&hls=1";
  }
  if (quality && quality !== "best") {
    url += `&quality=${encodeURIComponent(quality)}`;
  }

  return url;
};
