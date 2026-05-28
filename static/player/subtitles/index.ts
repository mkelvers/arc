import type { SubtitleCue, SubtitleTrack } from "../types";
import { state } from "../state";
import { parseVtt } from "./vtt";

// proxy subtitle URL through backend (avoids CORS)
const proxyUrl = (token: string) => `/watch/proxy/subtitle?token=${encodeURIComponent(token)}`;

// builds subtitle track list from current mode's source
const subtitlesForMode = (): SubtitleTrack[] => {
  const src = state.modeSources[state.currentMode];
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
  const el = state.container.querySelector("[data-subtitle-text]") as HTMLElement | null;
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
  } catch {
    return [];
  }
};

/**
 * Rebuilds subtitle dropdown from current mode's available tracks.
 * Shows/hides dropdown based on availability.
 */
export const updateSubtitleOptions = (): void => {
  const select = state.container.querySelector(
    "[data-subtitle-select]",
  ) as HTMLSelectElement | null;
  if (!select) return;
  state.currentSubtitleTracks = subtitlesForMode();
  select.innerHTML = "";

  const none = document.createElement("option");
  none.value = "none";
  none.textContent = "Off";
  select.appendChild(none);
  select.value = "none";

  state.currentSubtitleTracks.forEach((t, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = t.label;
    select.appendChild(opt);
  });

  const wrapper = select.parentElement;
  wrapper?.classList.toggle("hidden", state.currentSubtitleTracks.length === 0);
  state.activeSubtitles = [];
  hideSubtitleText();
};

/**
 * Updates subtitle text display based on current video time.
 * Finds active cue and shows/hides overlay.
 */
export const updateSubtitleRender = (time: number): void => {
  const el = state.container.querySelector("[data-subtitle-text]") as HTMLElement | null;
  if (!el) return;
  if (!state.activeSubtitles.length) {
    hideSubtitleText();
    return;
  }

  // binary search: cues are sorted by start time
  let lo = 0;
  let hi = state.activeSubtitles.length - 1;
  let cue: SubtitleCue | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = state.activeSubtitles[mid];
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
  const select = state.container.querySelector(
    "[data-subtitle-select]",
  ) as HTMLSelectElement | null;
  select?.addEventListener("change", async () => {
    if (select.value === "none") {
      state.activeSubtitles = [];
      hideSubtitleText();
      return;
    }
    const track = state.currentSubtitleTracks[Number(select.value)];
    if (!track) {
      state.activeSubtitles = [];
      return;
    }
    const cues = await loadSubtitle(track.url);
    cues.sort((a, b) => a.start - b.start);
    state.activeSubtitles = cues;
  });
};
