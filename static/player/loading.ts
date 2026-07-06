import { state } from "./state";

export type PlayerLoadState =
  | "idle"
  | "resolving_source"
  | "loading_media"
  | "buffering"
  | "retrying"
  | "ready"
  | "unavailable";

type PlayerLoadProfile = {
  bufferingCount: number;
  lastBufferingMs: number;
  lastMediaMetadataMs: number;
  lastSourceResolutionMs: number;
  retryCount: number;
  totalBufferingMs: number;
  unavailableCount: number;
};

declare global {
  interface Window {
    __malPlayerLoadProfile?: PlayerLoadProfile;
  }
}

let currentState: PlayerLoadState = "idle";
let phaseStartedAt = 0;
let retryController: AbortController | null = null;
let retryInFlight = false;

const profile = (): PlayerLoadProfile => {
  window.__malPlayerLoadProfile ??= {
    bufferingCount: 0,
    lastBufferingMs: 0,
    lastMediaMetadataMs: 0,
    lastSourceResolutionMs: 0,
    retryCount: 0,
    totalBufferingMs: 0,
    unavailableCount: 0,
  };
  return window.__malPlayerLoadProfile;
};

const measure = (name: string, startedAt: number, duration: number): void => {
  try {
    performance.measure(`mal.player.${name}`, { start: startedAt, duration });
  } catch (error) {
    console.debug("failed to measure player loading phase:", error);
  }
};

const finishPhase = (): void => {
  if (phaseStartedAt <= 0) {
    return;
  }
  const duration = performance.now() - phaseStartedAt;
  const metrics = profile();
  if (currentState === "resolving_source") {
    metrics.lastSourceResolutionMs = duration;
    measure("source_resolution", phaseStartedAt, duration);
  } else if (currentState === "loading_media") {
    metrics.lastMediaMetadataMs = duration;
    measure("media_metadata", phaseStartedAt, duration);
  } else if (currentState === "buffering") {
    metrics.lastBufferingMs = duration;
    metrics.totalBufferingMs += duration;
    measure("buffering", phaseStartedAt, duration);
  }
};

const isBusy = (loadState: PlayerLoadState): boolean =>
  loadState === "resolving_source" ||
  loadState === "loading_media" ||
  loadState === "buffering" ||
  loadState === "retrying";

const elements = (): {
  back: HTMLElement | null;
  loading: HTMLElement | null;
  retry: HTMLButtonElement | null;
  spinner: HTMLElement | null;
} => ({
  back: state.elements.container.querySelector("[data-loading-back]"),
  loading: state.elements.container.querySelector("[data-loading]"),
  retry: state.elements.container.querySelector("[data-loading-retry]"),
  spinner: state.elements.container.querySelector("[data-loading-spinner]"),
});

const showRecovery = (): void => {
  const { back, retry } = elements();
  retry?.classList.remove("hidden");
  back?.classList.remove("hidden");
};

export const setPlayerLoadState = (nextState: PlayerLoadState): void => {
  if (nextState === currentState) {
    return;
  }

  finishPhase();
  currentState = nextState;
  phaseStartedAt = isBusy(nextState) ? performance.now() : 0;

  const { back, loading, retry, spinner } = elements();
  state.elements.container.dataset.loadState = nextState;
  state.elements.container.setAttribute("aria-busy", String(isBusy(nextState)));

  const visible = isBusy(nextState) || nextState === "unavailable";
  if (loading) {
    loading.style.display = visible ? "flex" : "none";
  }
  spinner?.classList.toggle("hidden", nextState === "unavailable");
  retry?.classList.add("hidden");
  back?.classList.add("hidden");

  if (nextState === "buffering") {
    profile().bufferingCount += 1;
  } else if (nextState === "retrying") {
    profile().retryCount += 1;
  } else if (nextState === "unavailable") {
    profile().unavailableCount += 1;
  }

  if (nextState === "unavailable") {
    showRecovery();
    retry?.focus({ preventScroll: true });
    return;
  }
  if (!isBusy(nextState)) {
    return;
  }
};

export const setupPlayerLoading = (retry: () => Promise<boolean>, signal: AbortSignal): void => {
  retryController?.abort();
  retryController = new AbortController();
  const retryButton = elements().retry;
  retryButton?.addEventListener(
    "click",
    () => {
      if (retryInFlight) {
        return;
      }
      retryInFlight = true;
      retryButton.disabled = true;
      setPlayerLoadState("retrying");
      retry()
        .then((refreshed) => {
          if (!refreshed) {
            setPlayerLoadState("unavailable");
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          console.error("failed to retry video source:", error);
          setPlayerLoadState("unavailable");
        })
        .finally(() => {
          retryInFlight = false;
          retryButton.disabled = false;
        });
    },
    { signal: retryController.signal },
  );
  signal.addEventListener("abort", () => retryController?.abort(), { once: true });
};

export const teardownPlayerLoading = (): void => {
  finishPhase();
  retryController?.abort();
  retryController = null;
  retryInFlight = false;
  currentState = "idle";
  phaseStartedAt = 0;
};
