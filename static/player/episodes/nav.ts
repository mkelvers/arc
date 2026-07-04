import { hydrateAlternateMode, updateModeButtons } from "../mode";
import { markEpisodeTransition } from "../progress";
import { updateQualityOptions } from "../quality";
import { resolveActiveSegments, renderSegments } from "../skip/segments";
import { streamUrlForMode } from "../source";
import { state, showEndState, hideEndState } from "../state";
import { safeLocalStorage } from "../storage";
import { updateSubtitleOptions } from "../subtitles";
import { isRecord, parseModeSources, parseSegments } from "../validate";
import { loadVideoSource } from "../video";
import { completeAnime } from "./complete";
import {
  isAutoplayEnabled,
  switchEpisodeRange,
  updateEpisodeHighlight,
  updateEpisodeNavigation,
  updateOverlay,
} from "./ui";

type EpisodePayload = {
  episodeTitle: string;
  initialMode: string;
  modeSources: ReturnType<typeof parseModeSources>;
  modeSwitchedFrom: string;
  segments: ReturnType<typeof parseSegments>;
  startTimeSeconds: number;
};

type TransitionHistory = "none" | "push" | "replace";

type TransitionOptions = {
  autoplay?: boolean;
  fallbackHref?: string;
  history?: TransitionHistory;
  restoreFocus?: boolean;
};

type ActiveTransition = {
  autoplay: boolean;
  controller: AbortController;
  fallbackHref: string;
  id: number;
  startedAt: number;
};

type EpisodeTransitionProfile = {
  aborted: number;
  fallback: number;
  lastMediaReadyMs: number;
  lastPayloadMs: number;
  lastTotalMs: number;
  stale: number;
  succeeded: number;
};

declare global {
  interface Window {
    __malEpisodeTransitionProfile?: EpisodeTransitionProfile;
  }
}

const profile = (): EpisodeTransitionProfile => {
  window.__malEpisodeTransitionProfile ??= {
    aborted: 0,
    fallback: 0,
    lastMediaReadyMs: 0,
    lastPayloadMs: 0,
    lastTotalMs: 0,
    stale: 0,
    succeeded: 0,
  };
  return window.__malEpisodeTransitionProfile;
};

const measure = (name: string, startedAt: number, duration: number): void => {
  try {
    performance.measure(name, { start: startedAt, duration });
  } catch (error) {
    console.debug("failed to measure episode transition:", error);
  }
};

let activeTransition: ActiveTransition | null = null;
let modeHydrationController: AbortController | null = null;
let transitionID = 0;

const episodeHref = (episode: number): string => {
  const url = new URL(window.location.href);
  url.searchParams.set("ep", String(episode));
  return url.toString();
};

const fallbackToEpisodeNavigation = (href: string, autoplay: boolean): void => {
  profile().fallback += 1;
  if (autoplay) {
    sessionStorage.setItem("mal:autoplay-next", "true");
  }
  window.location.href = href;
};

const parseEpisodePayload = (value: unknown): EpisodePayload | null => {
  if (!isRecord(value)) {
    return null;
  }
  const modeSources = parseModeSources(value.mode_sources);
  if (Object.keys(modeSources).length === 0) {
    return null;
  }
  const parsedStartTime = Number(value.start_time_seconds);
  return {
    episodeTitle: typeof value.episode_title === "string" ? value.episode_title : "",
    initialMode: typeof value.initial_mode === "string" ? value.initial_mode : "",
    modeSources,
    modeSwitchedFrom: typeof value.mode_switched_from === "string" ? value.mode_switched_from : "",
    segments: parseSegments(value.segments),
    startTimeSeconds: Number.isFinite(parsedStartTime) && parsedStartTime > 0 ? parsedStartTime : 0,
  };
};

const selectedMode = (payload: EpisodePayload, requestedMode: string): string | null => {
  if (payload.modeSources[requestedMode]?.token) {
    return requestedMode;
  }
  if (payload.modeSources[payload.initialMode]?.token) {
    return payload.initialMode;
  }
  return Object.keys(payload.modeSources).find((mode) => payload.modeSources[mode]?.token) ?? null;
};

const updateHistory = (episode: number, mode: TransitionHistory): void => {
  if (mode === "none") {
    return;
  }
  const href = episodeHref(episode);
  if (mode === "replace") {
    history.replaceState(null, "", href);
    return;
  }
  history.pushState(null, "", href);
};

const showLoader = (): void => {
  const loading = state.elements.container.querySelector("[data-loading]") as HTMLElement | null;
  if (loading) {
    loading.style.display = "flex";
  }
};

const finishTransition = (transition: ActiveTransition): void => {
  if (activeTransition?.id !== transition.id) {
    return;
  }
  const elapsed = performance.now() - transition.startedAt;
  const metrics = profile();
  metrics.lastMediaReadyMs = elapsed;
  metrics.lastTotalMs = elapsed;
  metrics.succeeded += 1;
  measure("episode_transition_media_ready_ms", transition.startedAt, elapsed);
  measure("episode_transition_total_ms", transition.startedAt, elapsed);
  state.episode.transitionEpisode = null;
  activeTransition = null;
  transition.controller.abort();
};

const monitorMediaReady = (transition: ActiveTransition): void => {
  const { signal } = transition.controller;
  let retried = false;

  const onLoadedMetadata = (): void => {
    finishTransition(transition);
  };
  const onError = (): void => {
    if (signal.aborted || activeTransition?.id !== transition.id) {
      return;
    }
    if (retried) {
      fallbackToEpisodeNavigation(transition.fallbackHref, transition.autoplay);
      return;
    }
    retried = true;
    fetch(
      `/api/watch/episode/${state.episode.malID}/${encodeURIComponent(state.episode.current)}?mode=${encodeURIComponent(state.playback.currentMode)}`,
      { signal },
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(`episode source refresh failed with status ${response.status}`);
        }
        return response.json();
      })
      .then((value: unknown) => {
        if (signal.aborted || activeTransition?.id !== transition.id) {
          return;
        }
        const payload = parseEpisodePayload(value);
        const mode = payload ? selectedMode(payload, state.playback.currentMode) : null;
        if (!payload || !mode) {
          throw new Error("episode source refresh returned no playable source");
        }
        state.playback.modeSources = payload.modeSources;
        state.playback.currentMode = mode;
        const source = payload.modeSources[mode];
        const preferredQuality = safeLocalStorage.getItem("mal:preferred-quality") || "best";
        loadVideoSource(
          streamUrlForMode(mode, preferredQuality),
          source.type,
          payload.startTimeSeconds,
          false,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("failed to refresh episode source:", error);
        fallbackToEpisodeNavigation(transition.fallbackHref, transition.autoplay);
      });
  };

  state.elements.video.addEventListener("loadedmetadata", onLoadedMetadata, { signal });
  state.elements.video.addEventListener("error", onError, { signal });
};

const hydrateEpisodeModes = (): void => {
  modeHydrationController?.abort();
  const controller = new AbortController();
  modeHydrationController = controller;
  hydrateAlternateMode(controller.signal)
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("failed to hydrate alternate mode after episode change:", error);
    })
    .finally(() => {
      if (modeHydrationController === controller) {
        modeHydrationController = null;
      }
    });
};

const commitEpisode = (
  episode: number,
  payload: EpisodePayload,
  mode: string,
  transition: ActiveTransition,
  options: TransitionOptions,
): void => {
  state.playback.modeSources = payload.modeSources;
  state.playback.currentMode = mode;
  state.playback.modeSwitchedFrom = payload.modeSwitchedFrom;
  state.playback.startTimeSeconds = payload.startTimeSeconds;
  state.playback.pendingSeekTime = null;
  state.episode.current = String(episode);
  state.episode.endedProgressSaved = false;
  state.episode.completionSent = false;
  state.episode.completionAttempts = 0;
  state.subtitles.activeCues = [];
  state.skip.parsedSegments = payload.segments;

  state.elements.container.dataset.currentEpisode = state.episode.current;
  state.elements.container.dataset.startTimeSeconds = String(payload.startTimeSeconds);
  hideEndState();

  const preferredQuality = safeLocalStorage.getItem("mal:preferred-quality") || "best";
  const source = payload.modeSources[mode];
  monitorMediaReady(transition);
  loadVideoSource(
    streamUrlForMode(mode, preferredQuality),
    source.type,
    payload.startTimeSeconds,
    false,
  );

  updateSubtitleOptions();
  updateQualityOptions();
  updateModeButtons();
  updateOverlay(state.episode.current, payload.episodeTitle);
  resolveActiveSegments();
  renderSegments();
  switchEpisodeRange(Math.floor((episode - 1) / 100));
  updateEpisodeHighlight(episode, options.restoreFocus ?? false);
  updateEpisodeNavigation(episode);
  updateHistory(episode, options.history ?? "push");

  if (payload.modeSwitchedFrom === "dub" && mode === "sub") {
    window.showToast?.({
      message: `Episode ${episode} is only available in sub, switched from dub.`,
    });
  }
  hydrateEpisodeModes();
};

export const transitionToEpisode = async (
  episode: number,
  options: TransitionOptions = {},
): Promise<boolean> => {
  if (
    !Number.isInteger(episode) ||
    episode < 1 ||
    (state.episode.total > 0 && episode > state.episode.total) ||
    episode === Number.parseInt(state.episode.current, 10) ||
    episode === state.episode.transitionEpisode
  ) {
    return false;
  }

  if (activeTransition) {
    activeTransition.controller.abort();
    profile().aborted += 1;
  }
  modeHydrationController?.abort();
  modeHydrationController = null;
  const transition: ActiveTransition = {
    autoplay: options.autoplay ?? false,
    controller: new AbortController(),
    fallbackHref: options.fallbackHref ?? episodeHref(episode),
    id: ++transitionID,
    startedAt: performance.now(),
  };
  activeTransition = transition;
  markEpisodeTransition(episode);
  showLoader();

  try {
    const requestedMode = state.playback.currentMode;
    const response = await fetch(
      `/api/watch/episode/${state.episode.malID}/${episode}?mode=${encodeURIComponent(requestedMode)}`,
      { signal: transition.controller.signal },
    );
    if (!response.ok) {
      throw new Error(`episode transition failed with status ${response.status}`);
    }
    const payload = parseEpisodePayload(await response.json());
    if (!payload) {
      throw new Error("episode transition returned no playable source");
    }
    if (activeTransition?.id !== transition.id) {
      profile().stale += 1;
      return false;
    }
    const mode = selectedMode(payload, requestedMode);
    if (!mode) {
      throw new Error("episode transition returned no playable mode");
    }
    const payloadElapsed = performance.now() - transition.startedAt;
    profile().lastPayloadMs = payloadElapsed;
    measure("episode_transition_payload_ms", transition.startedAt, payloadElapsed);
    commitEpisode(episode, payload, mode, transition, options);
    return true;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return false;
    }
    if (activeTransition?.id !== transition.id) {
      profile().stale += 1;
      return false;
    }
    console.error("failed to transition episode:", error);
    fallbackToEpisodeNavigation(transition.fallbackHref, options.autoplay ?? false);
    return false;
  }
};

const episodeFromLink = (anchor: HTMLAnchorElement): { episode: number; href: string } | null => {
  if (anchor.target && anchor.target !== "_self") {
    return null;
  }
  const url = new URL(anchor.href, window.location.href);
  const parts = url.pathname.split("/").filter(Boolean);
  const episode = Number.parseInt(anchor.dataset.episodeId ?? url.searchParams.get("ep") ?? "", 10);
  if (
    url.origin !== window.location.origin ||
    parts[0] !== "anime" ||
    parts[2] !== "watch" ||
    Number.parseInt(parts[1] ?? "", 10) !== state.episode.malID ||
    !Number.isInteger(episode) ||
    episode < 1
  ) {
    return null;
  }
  return { episode, href: url.toString() };
};

export const handleEpisodeNavigationClick = (event: MouseEvent): boolean => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  const anchor = target.closest("a[data-episode-id]");
  if (!(anchor instanceof HTMLAnchorElement)) {
    return false;
  }
  const destination = episodeFromLink(anchor);
  if (!destination || destination.episode === Number.parseInt(state.episode.current, 10)) {
    return false;
  }
  event.preventDefault();
  void transitionToEpisode(destination.episode, {
    fallbackHref: destination.href,
    history: "push",
    restoreFocus: true,
  });
  return true;
};

export const setupEpisodeNavigation = (signal: AbortSignal): void => {
  const root = document.querySelector("[data-episode-navigation]");
  root?.addEventListener(
    "click",
    (event) => {
      if (event instanceof MouseEvent) {
        handleEpisodeNavigationClick(event);
      }
    },
    { signal },
  );

  window.addEventListener(
    "popstate",
    () => {
      const url = new URL(window.location.href);
      const episode = Number.parseInt(url.searchParams.get("ep") ?? "1", 10);
      if (!episode || episode === Number.parseInt(state.episode.current, 10)) {
        return;
      }
      void transitionToEpisode(episode, { fallbackHref: url.toString(), history: "none" });
    },
    { signal },
  );

  signal.addEventListener(
    "abort",
    () => {
      activeTransition?.controller.abort();
      activeTransition = null;
      modeHydrationController?.abort();
      modeHydrationController = null;
    },
    { once: true },
  );
};

/** Handles video end: completes the series or advances when autoplay is enabled. */
export const goToNextEpisode = async (): Promise<void> => {
  const currentEpisode = Number.parseInt(state.episode.current, 10);
  if (!currentEpisode) {
    return;
  }
  if (state.episode.total > 0 && currentEpisode >= state.episode.total) {
    if (!state.episode.isAiring) {
      completeAnime(currentEpisode).catch((error: unknown) => {
        console.error("failed to complete final episode:", error);
      });
    }
    showEndState();
    return;
  }
  if (!isAutoplayEnabled()) {
    showEndState();
    return;
  }
  const nextEpisode = currentEpisode + 1;
  await transitionToEpisode(nextEpisode, {
    autoplay: true,
    fallbackHref: episodeHref(nextEpisode),
    history: "push",
  });
};
