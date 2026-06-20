import { state, showEndState, hideEndState } from "../state";
import type { SkipSegment } from "../types";
import { resolveActiveSegments, renderSegments } from "../skip/segments";
import { updateSubtitleOptions } from "../subtitles";
import { updateQualityOptions } from "../quality";
import { hydrateAlternateMode, updateModeButtons } from "../mode";
import { updateOverlay, isAutoplayEnabled, switchEpisodeRange } from "./ui";
import { markEpisodeTransition } from "../progress";
import { safeLocalStorage } from "../storage";
import { completeAnime } from "./complete";
import { loadVideoSource } from "../video";

/**
 * Handles video end: either marks complete or loads next episode.
 * Fetches episode data from API, updates player state and URL.
 */
export const goToNextEpisode = async (): Promise<void> => {
  const currentEp = Number.parseInt(state.episode.current, 10);
  if (!currentEp) return;

  const navigateToEpisode = (episode: number): void => {
    const url = new URL(window.location.href);
    url.searchParams.set("ep", String(episode));
    window.location.href = url.toString();
  };

  const fallbackToEpisodeNavigation = (episode: number): void => {
    sessionStorage.setItem("mal:autoplay-next", "true");
    navigateToEpisode(episode);
  };

  // final episode: trigger completion flow or just stop if airing
  if (state.episode.total > 0 && currentEp >= state.episode.total) {
    if (!state.episode.isAiring) {
      completeAnime(currentEp).catch((error) => {
        console.error("failed to complete final episode:", error);
      });
    }
    showEndState();
    return;
  }

  // skip if autoplay disabled
  if (!isAutoplayEnabled()) {
    showEndState();
    return;
  }

  const nextEp = currentEp + 1;
  markEpisodeTransition(nextEp);

  try {
    const res = await fetch(
      `/api/watch/episode/${state.episode.malID}/${nextEp}?mode=${encodeURIComponent(state.playback.currentMode)}`,
    );
    if (!res.ok) {
      // fallback: full page navigation
      fallbackToEpisodeNavigation(nextEp);
      return;
    }

    const data = await res.json();

    // update state with new episode data
    state.playback.modeSources = data.mode_sources ?? {};

    const backendMode = typeof data.initial_mode === "string" ? data.initial_mode : "";
    const fallback = state.playback.modeSources[backendMode]?.token
      ? backendMode
      : state.playback.availableModes.find((m) => state.playback.modeSources[m]?.token);
    if (!fallback) {
      fallbackToEpisodeNavigation(nextEp);
      return;
    }

    state.episode.current = String(nextEp);
    state.playback.currentMode = fallback;
    state.episode.endedProgressSaved = false;

    hideEndState();

    if (data.mode_switched_from === "dub" && fallback === "sub") {
      window.showToast?.({
        message: `Episode ${nextEp} is only available in sub, switched from dub.`,
      });
    }
    // The progress reset is sent asynchronously, so do not trust the fetch to observe it first.
    state.playback.startTimeSeconds = 0;
    state.elements.container.dataset.currentEpisode = state.episode.current;
    state.elements.container.dataset.startTimeSeconds = String(state.playback.startTimeSeconds);

    // load new video (keep preferences)
    const preferredQuality = safeLocalStorage.getItem("mal:preferred-quality") || "best";
    const source = state.playback.modeSources[fallback];
    const nextSourceURL = `${state.playback.streamURL}?mode=${encodeURIComponent(fallback)}&token=${encodeURIComponent(source.token)}${source.type === "m3u8" ? "&hls=1" : ""}${preferredQuality !== "best" ? `&quality=${encodeURIComponent(preferredQuality)}` : ""}`;
    loadVideoSource(nextSourceURL, source.type);
    if (!state.elements.video.paused) {
      state.elements.video.play().catch((error) => {
        console.debug("failed to play video:", error);
      });
    }

    state.playback.pendingSeekTime = null;
    state.episode.completionSent = false;
    state.episode.completionAttempts = 0;
    state.subtitles.activeCues = [];

    // update UI
    updateSubtitleOptions();
    updateQualityOptions();
    updateModeButtons();
    updateOverlay(state.episode.current, data.episode_title ?? "");
    hydrateAlternateMode().catch((error) => {
      console.error("failed to hydrate alternate mode after episode change:", error);
    });

    // update skip segments
    if (data.segments?.length) {
      state.skip.parsedSegments = data.segments
        .map((s: SkipSegment) => ({ ...s, start: Number(s.start) || 0, end: Number(s.end) || 0 }))
        .filter((s: SkipSegment) => s.end > s.start);
      resolveActiveSegments();
      renderSegments();
    }

    // highlight new episode in list/grid
    state.elements.episodeList
      ?.querySelectorAll("[data-episode-id]")
      .forEach((el) => el.classList.remove("bg-accent/20"));
    const newListEl = state.elements.episodeList?.querySelector(`[data-episode-id="${nextEp}"]`);
    newListEl?.classList.add("bg-accent/20");

    if (state.elements.episodeGrid) {
      state.elements.episodeGrid.querySelectorAll("[data-episode-id]").forEach((el) => {
        el.classList.remove("bg-accent/20", "ring-2", "ring-accent", "text-accent");
      });
      switchEpisodeRange(Math.floor((nextEp - 1) / 100));
      const newGridEl = state.elements.episodeGrid.querySelector(`[data-episode-id="${nextEp}"]`);
      newGridEl?.classList.add("bg-accent/20", "ring-2", "ring-accent", "text-accent");
    }

    // update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.set("ep", String(nextEp));
    history.pushState(null, "", url.toString());
  } catch (error) {
    console.error("failed to update url:", error);
    fallbackToEpisodeNavigation(nextEp);
  }
};
