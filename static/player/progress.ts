import { state } from "./state";
import { displayTimeFromAbsolute, getBounds } from "./timeline";

const snapToEnd = (time: number): number => {
  const { duration } = getBounds();
  if (duration > 0 && Math.abs(time - duration) < 2) {
    return duration;
  }
  return time;
};

// builds JSON payload for progress API
const buildPayload = (episode: number, seconds: number): string =>
  JSON.stringify({ mal_id: state.episode.malID, episode, time_seconds: seconds });

// sends progress via beacon (survives page unload)
const sendBeacon = (payload: string): boolean => {
  if (!navigator.sendBeacon) {
    return false;
  }
  navigator.sendBeacon("/api/watch-progress", new Blob([payload], { type: "application/json" }));
  return true;
};

let saveProgressInFlight: Promise<void> | null = null;

const currentProgressTime = (): number => displayTimeFromAbsolute(state.elements.video.currentTime);

/** Saves current progress to backend. Debounced: skips if within 5s of last save for same episode. */
export const saveProgress = async (
  force: boolean = false,
  progressSeconds: number = currentProgressTime(),
): Promise<void> => {
  if (saveProgressInFlight) {
    if (!force) {
      return saveProgressInFlight;
    }
    await saveProgressInFlight;
  }

  const request = (async (): Promise<void> => {
    if (state.episode.endedProgressSaved && !force) {
      return;
    }
    if (state.episode.transitionEpisode !== null || !state.episode.malID || progressSeconds < 1) {
      return;
    }
    const episode = Number.parseInt(state.episode.current, 10);
    if (!episode) {
      return;
    }

    const savedTime = snapToEnd(progressSeconds);
    // skip if recently saved, unless forced
    if (
      !force &&
      state.episode.lastSavedProgress.episode === state.episode.current &&
      Math.abs(state.episode.lastSavedProgress.seconds - savedTime) < 5
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
      if (!res.ok) {
        throw new Error(`progress save failed with status ${res.status}`);
      }
      state.episode.lastSavedProgress = { episode: state.episode.current, seconds: savedTime };
    } catch (error) {
      console.error("progress save failed:", error);
      throw error;
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
  if (state.timers.progressSaveTimer !== undefined) {
    return;
  }
  state.timers.progressSaveTimer = window.setTimeout(() => {
    state.timers.progressSaveTimer = undefined;
    saveProgress().catch((error) => {
      console.error("scheduled progress save failed:", error);
    });
  }, 30_000);
};

/**
 * Records episode transition (clicked external link to next episode). Uses beacon for reliability
 * on page unload.
 */
export const markEpisodeTransition = (episodeNumber: number): void => {
  if (!state.episode.malID || !episodeNumber) {
    return;
  }
  if (state.timers.progressSaveTimer !== undefined) {
    window.clearTimeout(state.timers.progressSaveTimer);
    state.timers.progressSaveTimer = undefined;
  }
  state.episode.transitionEpisode = episodeNumber;
  const payload = buildPayload(episodeNumber, 0);
  // beacon falls back to fetch with keepalive
  if (!sendBeacon(payload)) {
    fetch("/api/watch-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: payload,
    }).catch((error) => {
      console.debug("failed to save progress:", error);
    });
  }
};

/** Sets up progress save on timeupdate, pause, mouseup (scrub end), and beforeunload. */
export const setupProgress = (): void => {
  // periodic save during playback
  state.elements.video.addEventListener("timeupdate", () => {
    scheduleProgressSave();
  });

  // immediate save on pause
  state.elements.video.addEventListener("pause", () => {
    window.clearTimeout(state.timers.progressSaveTimer);
    state.timers.progressSaveTimer = undefined;
    if (state.episode.endedProgressSaved) {
      return;
    }

    // If we're at the very end, force a save to ensure we don't skip the last frame
    const isAtEnd =
      state.elements.video.duration > 0 &&
      Math.abs(state.elements.video.currentTime - state.elements.video.duration) < 1.5;

    saveProgress(isAtEnd).catch((error) => {
      console.error("pause progress save failed:", error);
    });
  });

  // save after scrubbing
  window.addEventListener("mouseup", () => {
    state.ui.isScrubbing = false;
    if (state.episode.endedProgressSaved) {
      return;
    }
    saveProgress().catch((error) => {
      console.error("scrub progress save failed:", error);
    });
  });

  // save on page close
  window.addEventListener("beforeunload", () => {
    if (
      state.episode.endedProgressSaved ||
      state.episode.transitionEpisode !== null ||
      !state.episode.malID
    ) {
      return;
    }
    const episode = Number.parseInt(state.episode.current, 10);
    if (!episode) {
      return;
    }
    const time = displayTimeFromAbsolute(state.elements.video.currentTime);
    sendBeacon(buildPayload(episode, snapToEnd(time)));
  });
};

export const saveEndedProgress = async (): Promise<void> => {
  const { duration } = getBounds();
  state.episode.endedProgressSaved = true;
  await saveProgress(true, duration > 0 ? duration : currentProgressTime());
};
