import { setPlayerLoadState } from "../loading";
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
  prefetchCancelled: number;
  prefetchExpired: number;
  prefetchFailed: number;
  prefetchStarted: number;
  prefetchUsed: number;
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
    prefetchCancelled: 0,
    prefetchExpired: 0,
    prefetchFailed: 0,
    prefetchStarted: 0,
    prefetchUsed: 0,
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

const prefetchTTL = 2 * 60 * 1000;
const prefetchLimit = 2;

type PrefetchReason = "next" | "hover";

type PrefetchEntry = {
  controller: AbortController;
  episode: number;
  expiresAt: number;
  mode: string;
  promise: Promise<EpisodePayload | null>;
  reason: PrefetchReason;
};

const prefetchedEpisodes = new Map<string, PrefetchEntry>();
let hoverPrefetchKey: string | null = null;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let prefetchEnabled = false;

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

const episodePayloadURL = (episode: number, mode: string, forceRefresh = false): string =>
  `/api/watch/episode/${state.episode.malID}/${encodeURIComponent(String(episode))}?mode=${encodeURIComponent(mode)}${forceRefresh ? "&refresh=1" : ""}`;

const fetchEpisodePayload = async (
  episode: number,
  mode: string,
  signal: AbortSignal,
  lowPriority = false,
  forceRefresh = false,
): Promise<EpisodePayload> => {
  const init: RequestInit & { priority?: "low" } = { signal };
  if (lowPriority) {
    init.priority = "low";
  }
  const response = await fetch(episodePayloadURL(episode, mode, forceRefresh), init);
  if (!response.ok) {
    throw new Error(`episode payload failed with status ${response.status}`);
  }
  const payload = parseEpisodePayload(await response.json());
  if (!payload) {
    throw new Error("episode payload returned no playable source");
  }
  return payload;
};

const prefetchKey = (episode: number, mode: string): string =>
  `${state.episode.malID}|${episode}|${mode}`;

const removePrefetch = (key: string, cancel: boolean): void => {
  const entry = prefetchedEpisodes.get(key);
  if (!entry) {
    return;
  }
  prefetchedEpisodes.delete(key);
  if (cancel) {
    entry.controller.abort();
  }
};

const startEpisodePrefetch = (
  episode: number,
  mode: string,
  reason: PrefetchReason,
): PrefetchEntry | null => {
  if (!Number.isInteger(episode) || episode < 1 || episode === Number(state.episode.current)) {
    return null;
  }
  const key = prefetchKey(episode, mode);
  const existing = prefetchedEpisodes.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    return existing;
  }
  if (existing) {
    removePrefetch(key, true);
  }

  const controller = new AbortController();
  const promise = fetchEpisodePayload(episode, mode, controller.signal, true)
    .catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        profile().prefetchFailed += 1;
      }
      return null;
    })
    .then((payload) => {
      if (!payload && prefetchedEpisodes.get(key)?.controller === controller) {
        prefetchedEpisodes.delete(key);
      }
      return payload;
    });
  const entry: PrefetchEntry = {
    controller,
    episode,
    expiresAt: Date.now() + prefetchTTL,
    mode,
    promise,
    reason,
  };
  prefetchedEpisodes.set(key, entry);
  profile().prefetchStarted += 1;

  while (prefetchedEpisodes.size > prefetchLimit) {
    const oldest = prefetchedEpisodes.keys().next().value as string | undefined;
    if (!oldest) {
      break;
    }
    removePrefetch(oldest, true);
  }
  return entry;
};

const takePrefetchedEpisode = (
  episode: number,
  mode: string,
): Promise<EpisodePayload | null> | null => {
  const key = prefetchKey(episode, mode);
  const entry = prefetchedEpisodes.get(key);
  if (!entry) {
    return null;
  }
  prefetchedEpisodes.delete(key);
  if (entry.expiresAt <= Date.now()) {
    entry.controller.abort();
    profile().prefetchExpired += 1;
    return null;
  }
  return entry.promise.then((payload) => {
    if (payload) {
      profile().prefetchUsed += 1;
    }
    return payload;
  });
};

const saveDataEnabled = (): boolean =>
  Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);

export const prefetchNextEpisode = (): void => {
  if (!prefetchEnabled || saveDataEnabled()) {
    return;
  }
  const current = Number.parseInt(state.episode.current, 10);
  const next = current + 1;
  if (!current || (state.episode.total > 0 && next > state.episode.total)) {
    return;
  }
  startEpisodePrefetch(next, state.playback.currentMode, "next");
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
      setPlayerLoadState("unavailable");
      return;
    }
    retried = true;
    setPlayerLoadState("retrying");
    fetchEpisodePayload(
      Number.parseInt(state.episode.current, 10),
      state.playback.currentMode,
      signal,
      false,
      true,
    )
      .then((payload) => {
        if (signal.aborted || activeTransition?.id !== transition.id) {
          return;
        }
        const mode = selectedMode(payload, state.playback.currentMode);
        if (!mode) {
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
        void error;
        setPlayerLoadState("unavailable");
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
      void error;
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
    controller: new AbortController(),
    fallbackHref: options.fallbackHref ?? episodeHref(episode),
    id: ++transitionID,
    startedAt: performance.now(),
  };
  activeTransition = transition;
  markEpisodeTransition(episode);
  setPlayerLoadState("resolving_source");

  try {
    const requestedMode = state.playback.currentMode;
    const prefetched = takePrefetchedEpisode(episode, requestedMode);
    const payload = prefetched
      ? ((await prefetched) ??
        (await fetchEpisodePayload(episode, requestedMode, transition.controller.signal)))
      : await fetchEpisodePayload(episode, requestedMode, transition.controller.signal);
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
    void error;
    if (options.autoplay) {
      setPlayerLoadState("idle");
      return false;
    }
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
  prefetchEnabled = true;
  root?.addEventListener(
    "click",
    (event) => {
      if (event instanceof MouseEvent) {
        handleEpisodeNavigationClick(event);
      }
    },
    { signal },
  );

  const cancelHoverPrefetch = (): void => {
    if (hoverTimer !== undefined) {
      clearTimeout(hoverTimer);
      hoverTimer = undefined;
    }
    if (hoverPrefetchKey) {
      const entry = prefetchedEpisodes.get(hoverPrefetchKey);
      if (entry?.reason === "hover") {
        removePrefetch(hoverPrefetchKey, true);
        profile().prefetchCancelled += 1;
      }
      hoverPrefetchKey = null;
    }
  };

  const scheduleHoverPrefetch = (target: EventTarget | null): void => {
    if (!(target instanceof Element)) {
      return;
    }
    const anchor = target.closest("a[data-episode-id]");
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }
    const destination = episodeFromLink(anchor);
    if (!destination || destination.episode === Number(state.episode.current)) {
      return;
    }
    cancelHoverPrefetch();
    const key = prefetchKey(destination.episode, state.playback.currentMode);
    hoverTimer = setTimeout(() => {
      hoverTimer = undefined;
      const entry = startEpisodePrefetch(destination.episode, state.playback.currentMode, "hover");
      hoverPrefetchKey = entry?.reason === "hover" ? key : null;
    }, 120);
  };

  root?.addEventListener(
    "pointerover",
    (event) => {
      scheduleHoverPrefetch(event.target);
    },
    { signal },
  );
  root?.addEventListener(
    "focusin",
    (event) => {
      scheduleHoverPrefetch(event.target);
    },
    { signal },
  );
  root?.addEventListener("pointerleave", cancelHoverPrefetch, { signal });
  root?.addEventListener("focusout", cancelHoverPrefetch, { signal });

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
      prefetchEnabled = false;
      cancelHoverPrefetch();
      for (const key of prefetchedEpisodes.keys()) {
        removePrefetch(key, true);
      }
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
      const advancing = await completeAnime(currentEpisode);
      if (advancing) {
        return;
      }
    }
    showEndState();
    return;
  }
  const nextEpisode = currentEpisode + 1;
  const advanced = await transitionToEpisode(nextEpisode, {
    autoplay: true,
    fallbackHref: episodeHref(nextEpisode),
    history: "push",
  });
  if (advanced) {
    return;
  }
  if (!state.episode.isAiring) {
    const advancing = await completeAnime(currentEpisode);
    if (advancing) {
      return;
    }
  }
  showEndState();
};
