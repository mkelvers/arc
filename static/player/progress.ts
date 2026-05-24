import { state } from './state';
import { displayTimeFromAbsolute } from './timeline';

// builds JSON payload for progress API
const buildPayload = (episode: number, seconds: number) =>
  JSON.stringify({
    mal_id: state.malID,
    episode,
    time_seconds: seconds,
  });

// sends progress via beacon (survives page unload)
const sendBeacon = (payload: string) => {
  if (!navigator.sendBeacon) return false;
  navigator.sendBeacon('/api/watch-progress', new Blob([payload], { type: 'application/json' }));
  return true;
};

let saveProgressInFlight: Promise<void> | null = null;

/**
 * Saves current progress to backend.
 * Debounced: skips if within 5s of last save for same episode.
 */
export const saveProgress = async (): Promise<void> => {
  if (saveProgressInFlight) return saveProgressInFlight;

  const request = (async (): Promise<void> => {
    if (state.transitionEpisode !== null || !state.malID || state.video.currentTime < 1) return;
    const episode = Number.parseInt(state.currentEpisode, 10);
    if (!episode) return;

    const safeTime = displayTimeFromAbsolute(state.video.currentTime);
    // skip if recently saved
    if (
      state.lastSavedProgress.episode === state.currentEpisode &&
      Math.abs(state.lastSavedProgress.seconds - safeTime) < 5
    ) {
      return;
    }

    const payload = buildPayload(episode, safeTime);
    try {
      const res = await fetch('/api/watch-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      if (!res.ok) return;
      state.lastSavedProgress = { episode: state.currentEpisode, seconds: safeTime };
    } catch {}
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
    fetch('/api/watch-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: payload,
    }).catch(() => {});
  }
};

/**
 * Sets up progress save on timeupdate, pause, mouseup (scrub end), and beforeunload.
 */
export const setupProgress = (): void => {
  // periodic save during playback
  state.video.addEventListener('timeupdate', () => {
    scheduleProgressSave();
  });

  // immediate save on pause
  state.video.addEventListener('pause', () => {
    window.clearTimeout(state.progressSaveTimer);
    state.progressSaveTimer = undefined;
    saveProgress();
  });

  // save after scrubbing
  window.addEventListener('mouseup', () => {
    state.isScrubbing = false;
    saveProgress();
  });

  // save on page close
  window.addEventListener('beforeunload', () => {
    if (state.transitionEpisode !== null || state.completionSent || !state.malID) return;
    const episode = Number.parseInt(state.currentEpisode, 10);
    if (!episode) return;
    sendBeacon(buildPayload(episode, displayTimeFromAbsolute(state.video.currentTime)));
  });
};
