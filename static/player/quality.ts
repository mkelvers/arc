import { streamUrlForMode } from "./source";
import { state } from "./state";
import { safeLocalStorage } from "./storage";
import { loadVideoSource } from "./video";

/** Switches video quality (resolution). Persists preference to localStorage. */
const switchQuality = (quality: string): void => {
  const url = streamUrlForMode(state.playback.currentMode, quality);
  if (!url) {
    return;
  }
  safeLocalStorage.setItem("mal:preferred-quality", quality);
  loadVideoSource(url, state.playback.modeSources[state.playback.currentMode]?.type);
};

/**
 * Rebuilds quality dropdown options from current mode's available qualities. Shows/hides dropdown
 * based on availability.
 */
export const updateQualityOptions = (): void => {
  const select = state.elements.container.querySelector(
    "[data-quality-select]",
  ) as HTMLSelectElement | null;
  if (!select) {
    return;
  }
  const qualities = state.playback.modeSources[state.playback.currentMode]?.qualities ?? [];
  select.replaceChildren();

  const best = document.createElement("option");
  best.value = "best";
  best.textContent = "Auto / Best";
  select.append(best);

  qualities.forEach((q) => {
    const opt = document.createElement("option");
    opt.value = q;
    opt.textContent = q;
    select.append(opt);
  });

  // restore saved preference
  const preferred = safeLocalStorage.getItem("mal:preferred-quality") || "best";
  select.value = qualities.includes(preferred) ? preferred : "best";

  // hide if no quality options
  const wrapper = select.parentElement;
  wrapper?.classList.toggle("hidden", qualities.length === 0);
};

/** Binds quality select change handler. */
export const setupQuality = (): void => {
  const select = state.elements.container.querySelector(
    "[data-quality-select]",
  ) as HTMLSelectElement | null;
  select?.addEventListener("change", (e) => {
    switchQuality((e.target as HTMLSelectElement).value);
  });
};
