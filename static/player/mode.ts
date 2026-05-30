import { state } from "./state";
import { showControls } from "./controls";
import { updateSubtitleOptions } from "./subtitles";
import { updateQualityOptions } from "./quality";
import { safeLocalStorage } from "./storage";
import { loadVideoSource } from "./video";

// builds stream URL with mode, token, and optional quality param
const streamUrlForMode = (mode: string, quality?: string): string => {
  const src = state.modeSources[mode];
  if (!src?.token) return "";
  let url = `${state.streamURL}?mode=${encodeURIComponent(mode)}&token=${encodeURIComponent(src.token)}`;
  if (quality && quality !== "best") url += `&quality=${encodeURIComponent(quality)}`;
  return url;
};

/**
 * Switches between sub/dub mode.
 * Saves preference to localStorage, reloads video src.
 */
export const switchMode = (mode: string): void => {
  if (!state.availableModes.includes(mode) || mode === state.currentMode) return;
  state.currentMode = mode;
  safeLocalStorage.setItem("player-audio-mode", mode);
  const qualitySelect = state.container.querySelector(
    "[data-quality-select]",
  ) as HTMLSelectElement | null;
  const url = streamUrlForMode(mode, qualitySelect?.value);
  loadVideoSource(url);

  // Fallback: if the media element doesn't actually switch sources (some browsers can get "stuck"),
  // reload the page with the desired mode and resume time via sessionStorage.
  if (url) {
    const expectedToken = state.modeSources[mode]?.token;
    const expectedMode = mode;
    const resumeSeconds = state.video.currentTime;
    window.setTimeout(() => {
      if (!expectedToken) return;
      const currentSrc = state.video.currentSrc || state.video.src || "";
      if (currentSrc.includes(`token=${encodeURIComponent(expectedToken)}`)) return;

      try {
        sessionStorage.setItem("mal:resume-after-mode-switch", String(resumeSeconds));
        const next = new URL(window.location.href);
        next.searchParams.set("mode", expectedMode);
        window.location.href = next.toString();
      } catch {
        // no-op
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
  const dub = state.container.querySelector("[data-mode-dub]") as HTMLButtonElement | null;
  const sub = state.container.querySelector("[data-mode-sub]") as HTMLButtonElement | null;
  const m = state.currentMode;

  dub?.classList.toggle("text-accent", m === "dub");
  dub?.classList.toggle("text-foreground", m !== "dub");
  dub?.classList.toggle("opacity-50", !state.availableModes.includes("dub"));
  dub?.classList.toggle("cursor-not-allowed", !state.availableModes.includes("dub"));
  if (dub) {
    dub.disabled = !state.availableModes.includes("dub");
  }

  sub?.classList.toggle("text-accent", m === "sub");
  sub?.classList.toggle("text-foreground", m !== "sub");
  sub?.classList.toggle("opacity-50", !state.availableModes.includes("sub"));
  sub?.classList.toggle("cursor-not-allowed", !state.availableModes.includes("sub"));
  if (sub) {
    sub.disabled = !state.availableModes.includes("sub");
  }
};

/**
 * Binds click handlers for mode buttons and autoplay toggle.
 */
export const setupMode = (): void => {
  const dub = state.container.querySelector("[data-mode-dub]") as HTMLButtonElement | null;
  const sub = state.container.querySelector("[data-mode-sub]") as HTMLButtonElement | null;

  dub?.addEventListener("click", () => {
    if (state.availableModes.includes("dub")) {
      switchMode("dub");
      showControls();
    }
  });
  sub?.addEventListener("click", () => {
    if (state.availableModes.includes("sub")) {
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
