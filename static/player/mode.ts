import { state } from "./state";
import { showControls } from "./controls";
import { updateSubtitleOptions } from "./subtitles";
import { updateQualityOptions } from "./quality";
import { safeLocalStorage } from "./storage";
import { streamUrlForMode } from "./source";
import { loadVideoSource } from "./video";
import { isRecord, parseModeSources } from "./validate";

const alternateModeFor = (mode: string): "sub" | "dub" | null => {
  if (mode === "sub") return "dub";
  if (mode === "dub") return "sub";
  return null;
};

export const hydrateAlternateMode = async (signal?: AbortSignal): Promise<void> => {
  const alternateMode = alternateModeFor(state.playback.currentMode);
  if (!alternateMode) return;
  if (state.playback.modeSources[alternateMode]?.token) return;

  try {
    const res = await fetch(
      `/api/watch/episode/${state.episode.malID}/${encodeURIComponent(state.episode.current)}?mode=${encodeURIComponent(alternateMode)}`,
      { signal },
    );
    if (!res.ok) return;

    const data: unknown = await res.json();
    if (!isRecord(data)) return;

    const sources = parseModeSources(data.mode_sources);
    const alternateSource = sources[alternateMode];
    if (!alternateSource?.token) return;

    state.playback.modeSources = {
      ...state.playback.modeSources,
      [alternateMode]: alternateSource,
    };

    updateSubtitleOptions();
    updateQualityOptions();
    updateModeButtons();
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") return;
  }
};

/**
 * Switches between sub/dub mode.
 * Saves preference to localStorage, reloads video src.
 */
export const switchMode = (mode: string): void => {
  if (!state.playback.availableModes.includes(mode) || mode === state.playback.currentMode) return;
  state.playback.currentMode = mode;
  safeLocalStorage.setItem("player-audio-mode", mode);
  const qualitySelect = state.elements.container.querySelector(
    "[data-quality-select]",
  ) as HTMLSelectElement | null;
  const url = streamUrlForMode(mode, qualitySelect?.value);
  loadVideoSource(url, state.playback.modeSources[mode]?.type);

  // Fallback: if the media element doesn't actually switch sources (some browsers can get "stuck"),
  // reload the page with the desired mode and resume time via sessionStorage.
  if (url) {
    const expectedToken = state.playback.modeSources[mode]?.token;
    const expectedMode = mode;
    const resumeSeconds = state.elements.video.currentTime;
    window.setTimeout(() => {
      if (!expectedToken) return;
      const currentSrc = state.elements.video.currentSrc || state.elements.video.src || "";
      if (currentSrc.includes(`token=${encodeURIComponent(expectedToken)}`)) return;

      try {
        sessionStorage.setItem("mal:resume-after-mode-switch", String(resumeSeconds));
        const next = new URL(window.location.href);
        next.searchParams.set("mode", expectedMode);
        window.location.href = next.toString();
      } catch (error) {
        console.error("failed to save resume state or switch mode:", error);
      }
    }, 800);
  }
  updateSubtitleOptions();
  updateQualityOptions();
  updateModeButtons();
};

/**
 * Updates dub/sub button styling based on current mode.
 * Disables unavailable modes.
 */
export const updateModeButtons = (): void => {
  const dub = state.elements.container.querySelector("[data-mode-dub]") as HTMLButtonElement | null;
  const sub = state.elements.container.querySelector("[data-mode-sub]") as HTMLButtonElement | null;
  const m = state.playback.currentMode;

  dub?.classList.toggle("text-accent", m === "dub");
  dub?.classList.toggle("text-foreground", m !== "dub");
  dub?.classList.toggle("opacity-50", !state.playback.availableModes.includes("dub"));
  dub?.classList.toggle("cursor-not-allowed", !state.playback.availableModes.includes("dub"));
  if (dub) {
    dub.disabled = !state.playback.availableModes.includes("dub");
  }

  sub?.classList.toggle("text-accent", m === "sub");
  sub?.classList.toggle("text-foreground", m !== "sub");
  sub?.classList.toggle("opacity-50", !state.playback.availableModes.includes("sub"));
  sub?.classList.toggle("cursor-not-allowed", !state.playback.availableModes.includes("sub"));
  if (sub) {
    sub.disabled = !state.playback.availableModes.includes("sub");
  }
};

/**
 * Binds click handlers for mode buttons and autoplay toggle.
 */
export const setupMode = (): void => {
  const dub = state.elements.container.querySelector("[data-mode-dub]") as HTMLButtonElement | null;
  const sub = state.elements.container.querySelector("[data-mode-sub]") as HTMLButtonElement | null;

  dub?.addEventListener("click", () => {
    if (state.playback.availableModes.includes("dub")) {
      switchMode("dub");
      showControls();
    }
  });
  sub?.addEventListener("click", () => {
    if (state.playback.availableModes.includes("sub")) {
      switchMode("sub");
      showControls();
    }
  });

  const autoplayBtn = document.querySelector("[data-autoplay]") as HTMLInputElement | null;
  autoplayBtn?.addEventListener("change", (e) => {
    safeLocalStorage.setItem(
      "mal:autoplay-enabled",
      (e.target as HTMLInputElement).checked ? "true" : "false",
    );
    showControls();
  });
};
