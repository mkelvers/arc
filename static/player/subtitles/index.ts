import type { SubtitleCue, SubtitleTrack } from "../types";
import { state } from "../state";
import { parseVtt } from "./vtt";

// proxy subtitle URL through backend (avoids CORS)
const proxyUrl = (token: string) => `/watch/proxy/subtitle?token=${encodeURIComponent(token)}`;

// builds subtitle track list from current mode's source
const subtitlesForMode = (): SubtitleTrack[] => {
  const src = state.playback.modeSources[state.playback.currentMode];
  if (!src?.subtitles) return [];
  return src.subtitles
    .map((t) => ({
      lang: (t.lang || "unknown").toLowerCase(),
      label: t.lang || "Unknown",
      url: proxyUrl(t.token),
    }))
    .filter((t) => t.url !== "");
};

const hideSubtitleText = (): void => {
  const el = state.elements.container.querySelector("[data-subtitle-text]") as HTMLElement | null;
  if (!el) return;
  el.textContent = "";
  el.classList.remove("block");
  el.classList.add("hidden");
};

// fetches and parses VTT from proxy URL
const loadSubtitle = async (url: string): Promise<SubtitleCue[]> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return parseVtt(await res.text());
  } catch (error) {
    console.error("failed to load subtitle:", error);
    return [];
  }
};

/**
 * Rebuilds subtitle dropdown from current mode's available tracks.
 * Shows/hides dropdown based on availability.
 */
export const updateSubtitleOptions = (): void => {
  const select = state.elements.container.querySelector(
    "[data-subtitle-select]",
  ) as HTMLSelectElement | null;
  if (!select) return;
  state.subtitles.tracks = subtitlesForMode();
  select.innerHTML = "";

  const none = document.createElement("option");
  none.value = "none";
  none.textContent = "Off";
  select.appendChild(none);
  select.value = "none";

  state.subtitles.tracks.forEach((t, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = t.label;
    select.appendChild(opt);
  });

  const wrapper = select.parentElement;
  wrapper?.classList.toggle("hidden", state.subtitles.tracks.length === 0);
  state.subtitles.activeCues = [];
  hideSubtitleText();
};

/**
 * Updates subtitle text display based on current video time.
 * Finds active cue and shows/hides overlay.
 */
export const updateSubtitleRender = (time: number): void => {
  const el = state.elements.container.querySelector("[data-subtitle-text]") as HTMLElement | null;
  if (!el) return;
  if (!state.subtitles.activeCues.length) {
    hideSubtitleText();
    return;
  }

  // binary search: cues are sorted by start time
  let lo = 0;
  let hi = state.subtitles.activeCues.length - 1;
  let cue: SubtitleCue | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = state.subtitles.activeCues[mid];
    if (time < c.start) {
      hi = mid - 1;
      continue;
    }
    if (time > c.end) {
      lo = mid + 1;
      continue;
    }
    cue = c;
    break;
  }
  if (!cue) {
    hideSubtitleText();
    return;
  }

  el.textContent = cue.text;
  el.classList.remove("hidden");
};

/**
 * Binds subtitle select change handler.
 * Loads and parses selected VTT track.
 */
export const setupSubtitles = (): void => {
  const select = state.elements.container.querySelector(
    "[data-subtitle-select]",
  ) as HTMLSelectElement | null;
  select?.addEventListener("change", async () => {
    if (select.value === "none") {
      state.subtitles.activeCues = [];
      hideSubtitleText();
      return;
    }
    const track = state.subtitles.tracks[Number(select.value)];
    if (!track) {
      state.subtitles.activeCues = [];
      return;
    }
    const cues = await loadSubtitle(track.url);
    cues.sort((a, b) => a.start - b.start);
    state.subtitles.activeCues = cues;
  });
};
