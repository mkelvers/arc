import { state } from "./state";
import { displayTimeFromAbsolute, getBounds } from "./timeline";

const snapToEnd = (time: number): number => {
  const duration = getBounds().duration;
  if (duration > 0 && Math.abs(time - duration) < 2) {
    return duration;
  }
  return time;
};

// builds JSON payload for progress API
const buildPayload = (episode: number, seconds: number): string =>
  JSON.stringify({
    mal_id: state.malID,
    episode,
    time_seconds: seconds,
  });

// sends progress via beacon (survives page unload)
const sendBeacon = (payload: string): boolean => {
  if (!navigator.sendBeacon) return false;
  navigator.sendBeacon("/api/watch-progress", new Blob([payload], { type: "application/json" }));
  return true;
};

let saveProgressInFlight: Promise<void> | null = null;

const currentProgressTime = (): number => displayTimeFromAbsolute(state.video.currentTime);

/**
 * Saves current progress to backend.
 * Debounced: skips if within 5s of last save for same episode.
 */
export const saveProgress = async (
  force: boolean = false,
  progressSeconds: number = currentProgressTime(),
): Promise<void> => {
  if (saveProgressInFlight) {
    if (!force) return saveProgressInFlight;
    await saveProgressInFlight;
  }

  const request = (async (): Promise<void> => {
    if (state.endedProgressSaved && !force) return;
    if (state.transitionEpisode !== null || !state.malID || progressSeconds < 1) return;
    const episode = Number.parseInt(state.currentEpisode, 10);
    if (!episode) return;

    const savedTime = snapToEnd(progressSeconds);
    // skip if recently saved, unless forced
    if (
      !force &&
      state.lastSavedProgress.episode === state.currentEpisode &&
      Math.abs(state.lastSavedProgress.seconds - savedTime) < 5
    ) {
      return;
    }

    const payload = buildPayload(episode, savedTime);
    try {
      const res = await fetch("/api/watch-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      if (!res.ok) return;
      state.lastSavedProgress = {
        episode: state.currentEpisode,
        seconds: savedTime,
      };
    } catch (e) {
      console.warn("Progress save failed:", e);
    }
  })();

  saveProgressInFlight = request;
  try {
    await request;
  } finally {
    if (saveProgressInFlight === request) {
      saveProgressInFlight = null;
    }
  }
};

// schedules periodic save every 30s during playback
const scheduleProgressSave = (): void => {
  if (state.progressSaveTimer !== undefined) return;
  state.progressSaveTimer = window.setTimeout(() => {
    state.progressSaveTimer = undefined;
    saveProgress();
  }, 30000);
};

/**
 * Records episode transition (clicked external link to next episode).
 * Uses beacon for reliability on page unload.
 */
export const markEpisodeTransition = (episodeNumber: number): void => {
  if (!state.malID || !episodeNumber) return;
  if (state.progressSaveTimer !== undefined) {
    window.clearTimeout(state.progressSaveTimer);
    state.progressSaveTimer = undefined;
  }
  state.transitionEpisode = episodeNumber;
  const payload = buildPayload(episodeNumber, 0);
  // beacon falls back to fetch with keepalive
  if (!sendBeacon(payload)) {
    fetch("/api/watch-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: payload,
    }).catch(() => undefined);
  }
};

/**
 * Sets up progress save on timeupdate, pause, mouseup (scrub end), and beforeunload.
 */
export const setupProgress = (): void => {
  // periodic save during playback
  state.video.addEventListener("timeupdate", () => {
    scheduleProgressSave();
  });

  // immediate save on pause
  state.video.addEventListener("pause", () => {
    window.clearTimeout(state.progressSaveTimer);
    state.progressSaveTimer = undefined;
    if (state.endedProgressSaved) return;

    // If we're at the very end, force a save to ensure we don't skip the last frame
    const isAtEnd =
      state.video.duration > 0 && Math.abs(state.video.currentTime - state.video.duration) < 1.5;

    saveProgress(isAtEnd);
  });

  // save after scrubbing
  window.addEventListener("mouseup", () => {
    state.isScrubbing = false;
    if (state.endedProgressSaved) return;
    saveProgress();
  });

  // save on page close
  window.addEventListener("beforeunload", () => {
    if (state.endedProgressSaved || state.transitionEpisode !== null || !state.malID) {
      return;
    }
    const episode = Number.parseInt(state.currentEpisode, 10);
    if (!episode) return;
    const time = displayTimeFromAbsolute(state.video.currentTime);
    sendBeacon(buildPayload(episode, snapToEnd(time)));
  });
};

export const saveEndedProgress = async (): Promise<void> => {
  const duration = getBounds().duration;
  state.endedProgressSaved = true;
  await saveProgress(true, duration > 0 ? duration : currentProgressTime());
};
