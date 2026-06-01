import { state } from "./state";

export const streamUrlForMode = (mode: string, quality?: string): string => {
  const src = state.modeSources[mode];
  if (!src?.token) return "";

  let url = `${state.streamURL}?mode=${encodeURIComponent(mode)}&token=${encodeURIComponent(src.token)}`;
  if (quality && quality !== "best") {
    url += `&quality=${encodeURIComponent(quality)}`;
  }

  return url;
};
