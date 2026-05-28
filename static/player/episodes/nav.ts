import { state } from "../state";
import type { SkipSegment } from "../types";
import { resolveActiveSegments, renderSegments } from "../skip/segments";
import { updateSubtitleOptions } from "../subtitles";
import { updateQualityOptions } from "../quality";
import { updateModeButtons } from "../mode";
import { updateOverlay, isAutoplayEnabled, switchEpisodeRange } from "./ui";
import { markEpisodeTransition } from "../progress";
import { safeLocalStorage } from "../storage";

/**
 * Handles video end: either marks complete or loads next episode.
 * Fetches episode data from API, updates player state and URL.
 */
export const goToNextEpisode = async (): Promise<void> => {
  const currentEp = Number.parseInt(state.currentEpisode, 10);
  if (!currentEp) return;

  // final episode: trigger completion flow
  if (state.totalEpisodes > 0 && currentEp >= state.totalEpisodes) {
    import("./complete").then((m) => m.completeAnime(currentEp));
    return;
  }

  // skip if autoplay disabled
  if (!isAutoplayEnabled()) return;

  const nextEp = currentEp + 1;
  markEpisodeTransition(nextEp);

  try {
    const res = await fetch(
      `/api/watch/episode/${state.malID}/${nextEp}?mode=${encodeURIComponent(state.currentMode)}`,
    );
    if (!res.ok) {
      // fallback: full page navigation
      sessionStorage.setItem("mal:autoplay-next", "true");
      const url = new URL(window.location.href);
      url.searchParams.set("ep", String(nextEp));
      window.location.href = url.toString();
      return;
    }

    const data = await res.json();

    // update state with new episode data
    state.modeSources = data.mode_sources ?? {};
    state.availableModes = data.available_modes ?? [];

    const backendMode = typeof data.initial_mode === "string" ? data.initial_mode : "";
    const fallback = state.modeSources[backendMode]?.token
      ? backendMode
      : state.availableModes.find((m) => state.modeSources[m]?.token);
    if (!fallback) {
      sessionStorage.setItem("mal:autoplay-next", "true");
      const url = new URL(window.location.href);
      url.searchParams.set("ep", String(nextEp));
      window.location.href = url.toString();
      return;
    }

    state.currentEpisode = String(nextEp);
    state.currentMode = fallback;
    if (data.mode_switched_from === "dub" && fallback === "sub") {
      window.showToast?.({
        message: `Episode ${nextEp} is only available in sub, switched from dub.`,
      });
    }
    // The progress reset is sent asynchronously, so do not trust the fetch to observe it first.
    state.startTimeSeconds = 0;
    state.container.dataset.currentEpisode = state.currentEpisode;
    state.container.dataset.startTimeSeconds = String(state.startTimeSeconds);

    // load new video (keep preferences)
    const preferredQuality = safeLocalStorage.getItem("mal:preferred-quality") || "best";
    state.video.src = `${state.streamURL}?mode=${encodeURIComponent(fallback)}&token=${encodeURIComponent(state.modeSources[fallback].token)}${preferredQuality !== "best" ? `&quality=${encodeURIComponent(preferredQuality)}` : ""}`;
    state.video.load();
    if (!state.video.paused) {
      state.video.play().catch(() => undefined);
    }

    state.pendingSeekTime = null;
    state.completionSent = false;
    state.completionAttempts = 0;
    state.activeSubtitles = [];

    // update UI
    updateSubtitleOptions();
    updateQualityOptions();
    updateModeButtons();
    updateOverlay(state.currentEpisode, data.episode_title ?? "");

    // update skip segments
    if (data.segments?.length) {
      state.parsedSegments = data.segments
        .map((s: SkipSegment) => ({ ...s, start: Number(s.start) || 0, end: Number(s.end) || 0 }))
        .filter((s: SkipSegment) => s.end > s.start);
      resolveActiveSegments();
      renderSegments();
    }

    // highlight new episode in list/grid
    state.episodeList
      ?.querySelectorAll("[data-episode-id]")
      .forEach((el) => el.classList.remove("bg-accent/20"));
    const newListEl = state.episodeList?.querySelector(`[data-episode-id="${nextEp}"]`);
    newListEl?.classList.add("bg-accent/20");

    if (state.episodeGrid) {
      state.episodeGrid.querySelectorAll("[data-episode-id]").forEach((el) => {
        el.classList.remove("bg-accent/20", "ring-2", "ring-accent", "text-accent");
      });
      switchEpisodeRange(Math.floor((nextEp - 1) / 100));
      const newGridEl = state.episodeGrid.querySelector(`[data-episode-id="${nextEp}"]`);
      newGridEl?.classList.add("bg-accent/20", "ring-2", "ring-accent", "text-accent");
    }

    // update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.set("ep", String(nextEp));
    history.pushState(null, "", url.toString());
  } catch {
    sessionStorage.setItem("mal:autoplay-next", "true");
    const url = new URL(window.location.href);
    url.searchParams.set("ep", String(nextEp));
    window.location.href = url.toString();
  }
};
