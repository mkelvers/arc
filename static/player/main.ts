import { onHtmxLoad, onReady } from "../utils";
import { setupControls, showControls } from "./controls";
import { formatTime } from "./controls";
import { goToNextEpisode, prefetchNextEpisode, setupEpisodeNavigation } from "./episodes/nav";
import { setupAutoplayButton, updateEpisodeHighlight, switchEpisodeRange } from "./episodes/ui";
import { setupKeyboard } from "./keyboard";
import { setPlayerLoadState, setupPlayerLoading, teardownPlayerLoading } from "./loading";
import {
  ensurePreferredModeSource,
  hydrateAlternateMode,
  setupMode,
  updateModeButtons,
} from "./mode";
import { saveEndedProgress, setupProgress } from "./progress";
import { setupQuality, updateQualityOptions } from "./quality";
import { setupSkip, updateSkipButton, updateAutoSkipButton } from "./skip";
import { setupSegmentEditor } from "./skip/editor";
import { resolveActiveSegments, renderSegments } from "./skip/segments";
import { refreshCurrentModeSource, resolveCurrentModeSource } from "./source";
import { state, initState, showEndState, hideEndState } from "./state";
import { safeLocalStorage } from "./storage";
import { setupSubtitles, updateSubtitleOptions, updateSubtitleRender } from "./subtitles";
import { invalidateBounds, updateTimeline } from "./timeline";
import {
  absoluteTimeFromDisplay,
  absoluteTimeFromRatio,
  getBounds,
  displayTimeFromAbsolute,
} from "./timeline";
import { destroyVideoSource, loadVideoSource } from "./video";

let currentContainer: HTMLElement | null = null;
let cleanup: (() => void) | null = null;

type ClosableDropdown = HTMLElement & { close: () => void };
const isClosableDropdown = (el: Element | null): el is ClosableDropdown => {
  if (!el) {
    return false;
  }
  if (!(el instanceof HTMLElement)) {
    return false;
  }
  const maybe = el as Partial<{ close: unknown }>;
  return typeof maybe.close === "function";
};

const hidePreviewPopover = (): void => {
  if (!state.elements.previewPopover) {
    return;
  }
  state.elements.previewPopover.classList.add("hidden");
  state.elements.previewPopover.classList.add("opacity-0");
  state.elements.previewPopover.classList.remove("opacity-100");
  state.elements.previewPopover.style.left = "";
};

const showPreviewPopover = (): void => {
  if (!state.elements.previewPopover) {
    return;
  }
  state.elements.previewPopover.classList.remove("hidden");
  state.elements.previewPopover.classList.remove("opacity-0");
  state.elements.previewPopover.classList.add("opacity-100");
};

const teardownPlayer = (): void => {
  cleanup?.();
  cleanup = null;
  teardownPlayerLoading();
  destroyVideoSource();
  currentContainer = null;
};

// updates time preview on progress bar hover
const updatePreviewUI = (ratio: number): void => {
  const progressWrap = state.elements.container.querySelector(
    "[data-progress-wrap]",
  ) as HTMLElement | null;
  if (!progressWrap || !state.elements.previewPopover || !state.elements.previewTime) {
    hidePreviewPopover();
    return;
  }
  const b = getBounds();
  if (b.duration <= 0) {
    hidePreviewPopover();
    return;
  }

  // show time for hovered position
  state.elements.previewTime.textContent = formatTime(
    Math.max(0, Math.min(b.duration, ratio * b.duration)),
  );

  const barWidth = progressWrap.clientWidth;
  if (barWidth <= 0) {
    hidePreviewPopover();
    return;
  }

  showPreviewPopover();
  // clamp to stay within bar bounds
  const popoverWidth = state.elements.previewPopover.offsetWidth || 72;
  state.elements.previewPopover.style.left = `${Math.max(popoverWidth / 2, Math.min(barWidth - popoverWidth / 2, ratio * barWidth))}px`;
};

const initPlayer = async (): Promise<void> => {
  const container = document.querySelector("[data-video-player]") as HTMLElement | null;
  if (!container) {
    return;
  }
  if (container === currentContainer) {
    return;
  }
  teardownPlayer();

  if (!initState(container)) {
    window.showToast?.({ message: "Video player markup is missing required controls." });
    return;
  }
  currentContainer = container;
  const abortController = new AbortController();
  const { signal } = abortController;
  let searchDebounce: number | undefined;
  cleanup = () => {
    clearTimeout(searchDebounce);
    abortController.abort();
  };

  const progressWrap = container.querySelector("[data-progress-wrap]") as HTMLElement | null;
  let sourceRefreshInFlight = false;
  let automaticSourceRefreshAttempted = false;

  setupPlayerLoading(() => {
    automaticSourceRefreshAttempted = true;
    return refreshCurrentModeSource(signal);
  }, signal);
  setPlayerLoadState("resolving_source");

  const scrubToPointer = (clientX: number, shouldShowControls: boolean): void => {
    if (!progressWrap) {
      return;
    }
    const rect = progressWrap.getBoundingClientRect();
    state.elements.video.currentTime = absoluteTimeFromRatio(
      Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    );
    updateTimeline(state.elements.video.currentTime);
    updateSkipButton(state.elements.video.currentTime);
    prefetchNextEpisode();
    if (shouldShowControls) {
      showControls();
    }
  };

  setupProgress();
  setupControls();
  setupKeyboard();
  setupSkip();
  setupSegmentEditor();
  setupSubtitles();
  setupQuality();
  setupMode();
  setupEpisodeNavigation(signal);

  updateSubtitleOptions();
  updateQualityOptions();
  updateModeButtons();
  setupAutoplayButton();
  updateAutoSkipButton();
  showControls();

  const playbackError = container.dataset.playbackError?.trim() ?? "";
  const hasPlayableSource = Object.values(state.playback.modeSources).some((source) =>
    Boolean(source?.token),
  );
  if (!hasPlayableSource) {
    if (playbackError) {
      window.showToast?.({
        message: "Playback is unavailable for this episode.",
        variant: "destructive",
      });
      setPlayerLoadState("unavailable");
    } else {
      resolveCurrentModeSource(signal)
        .then((resolved) => {
          if (!resolved) {
            setPlayerLoadState("unavailable");
            return;
          }
          updateSubtitleOptions();
          updateQualityOptions();
          updateModeButtons();
          resolveActiveSegments();
          renderSegments();
          if (state.playback.modeSwitchedFrom === "dub" && state.playback.currentMode === "sub") {
            window.showToast?.({
              message: `Episode ${state.episode.current} is only available in sub, switched from dub.`,
            });
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          console.error("failed to resolve initial video source:", error);
          setPlayerLoadState("unavailable");
        });
    }
  } else {
    await ensurePreferredModeSource(signal);
  }

  const resumeAfterModeSwitch = (() => {
    try {
      const raw = sessionStorage.getItem("mal:resume-after-mode-switch");
      if (raw === null) {
        return null;
      }
      sessionStorage.removeItem("mal:resume-after-mode-switch");
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    } catch (error) {
      console.error("failed to parse resume state:", error);
      return null;
    }
  })();
  const initialStartTime = resumeAfterModeSwitch ?? state.playback.startTimeSeconds;

  // build video src from mode, token, and saved quality preference
  if (hasPlayableSource) {
    const preferredQuality = safeLocalStorage.getItem("mal:preferred-quality") || "best";
    const streamToken = state.playback.modeSources[state.playback.currentMode]?.token;
    const source = state.playback.modeSources[state.playback.currentMode];
    if (streamToken) {
      const url = `${state.playback.streamURL}?mode=${encodeURIComponent(state.playback.currentMode)}&token=${encodeURIComponent(streamToken)}${source?.type === "m3u8" ? "&hls=1" : ""}${preferredQuality !== "best" ? `&quality=${encodeURIComponent(preferredQuality)}` : ""}`;
      loadVideoSource(url, source?.type, initialStartTime);
    }
  }

  updateSubtitleOptions();
  updateQualityOptions();
  updateModeButtons();

  if (state.playback.modeSwitchedFrom === "dub" && state.playback.currentMode === "sub") {
    window.showToast?.({
      message: `Episode ${state.episode.current} is only available in sub, switched from dub.`,
    });
  }

  const onLoadedMetadata = (): void => {
    setPlayerLoadState("ready");
    invalidateBounds();

    resolveActiveSegments();
    renderSegments();

    // Resume from saved position
    const startTime = state.playback.startTimeSeconds;
    const bounds = getBounds();
    const resumeTime = bounds.duration > 0 ? Math.min(startTime, bounds.duration) : 0;
    const isAtEnd = startTime > 0 && bounds.duration > 0 && startTime >= bounds.duration - 2;

    if (resumeAfterModeSwitch !== null) {
      const clamped = bounds.duration > 0 ? Math.min(resumeAfterModeSwitch, bounds.duration) : 0;
      if (clamped > 0) {
        state.elements.video.currentTime = clamped;
      }
    }

    if (startTime > 0 && state.elements.video.currentTime <= 2) {
      if (resumeTime > 0) {
        state.elements.video.currentTime = absoluteTimeFromDisplay(resumeTime);
      }
    }
    // resume after mode switch
    if (state.playback.pendingSeekTime !== null) {
      state.elements.video.currentTime = absoluteTimeFromDisplay(state.playback.pendingSeekTime);
      state.playback.pendingSeekTime = null;
    }
    if (state.episode.transitionEpisode === Number.parseInt(state.episode.current, 10)) {
      state.episode.transitionEpisode = null;
    }
    // autoplay if not already playing (inline script may have already called play())
    // but don't autoplay if we've reached the end
    if (!isAtEnd && (state.playback.shouldAutoPlay || state.elements.video.paused)) {
      state.elements.video.play().catch((error) => {
        console.debug("failed to autoplay video:", error);
      });
    }

    updateTimeline(state.elements.video.currentTime);
    updateSkipButton(state.elements.video.currentTime);

    // Apply end-state visuals if we resumed at the end
    if (isAtEnd) {
      showEndState();
    }
  };

  state.elements.video.addEventListener("loadedmetadata", onLoadedMetadata, { signal });
  if (state.elements.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    onLoadedMetadata();
  }

  state.elements.video.addEventListener(
    "waiting",
    () => {
      setPlayerLoadState(
        state.elements.video.readyState >= HTMLMediaElement.HAVE_METADATA
          ? "buffering"
          : "loading_media",
      );
    },
    { signal },
  );
  state.elements.video.addEventListener(
    "playing",
    () => {
      setPlayerLoadState("ready");
    },
    { signal },
  );
  state.elements.video.addEventListener(
    "error",
    () => {
      if (sourceRefreshInFlight || state.episode.transitionEpisode !== null) {
        return;
      }
      if (automaticSourceRefreshAttempted) {
        setPlayerLoadState("unavailable");
        return;
      }
      automaticSourceRefreshAttempted = true;
      sourceRefreshInFlight = true;
      setPlayerLoadState("retrying");
      refreshCurrentModeSource(signal)
        .then((refreshed) => {
          if (!refreshed) {
            setPlayerLoadState("unavailable");
          }
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          console.error("failed to refresh video source:", error);
          setPlayerLoadState("unavailable");
        })
        .finally(() => {
          sourceRefreshInFlight = false;
        });
    },
    { signal },
  );
  // update progress bar during buffering
  state.elements.video.addEventListener(
    "progress",
    () => {
      updateTimeline(state.elements.video.currentTime);
    },
    { signal },
  );

  // main loop: update progress, subtitles, skip buttons
  state.elements.video.addEventListener(
    "timeupdate",
    () => {
      updateTimeline(state.elements.video.currentTime);
      updateSubtitleRender(displayTimeFromAbsolute(state.elements.video.currentTime));
      updateSkipButton(state.elements.video.currentTime);

      // Restore visibility if we've moved away from the end
      if (state.elements.video.currentTime < state.elements.video.duration - 1) {
        hideEndState();
      }
    },
    { signal },
  );

  state.elements.video.addEventListener(
    "ended",
    async () => {
      await saveEndedProgress();
      await goToNextEpisode();
    },
    { signal },
  );

  // click/drag to seek (pointer events are more consistent across fullscreen/mobile)
  progressWrap?.addEventListener(
    "pointerdown",
    (e) => {
      // ignore right/middle click
      if ("button" in e && e.button !== 0) {
        return;
      }
      state.ui.isScrubbing = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch (error) {
        console.error("failed to capture pointer:", error);
        throw error;
      }
      scrubToPointer(e.clientX, true);
    },
    { signal },
  );

  // hover to preview time
  progressWrap?.addEventListener(
    "pointermove",
    (e) => {
      const rect = progressWrap.getBoundingClientRect();
      updatePreviewUI(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    },
    { signal },
  );

  progressWrap?.addEventListener("pointerleave", hidePreviewPopover, { signal });
  progressWrap?.addEventListener(
    "pointerup",
    () => {
      // ensure we finish the seek even if no window mousemove fired
      if (!progressWrap) {
        return;
      }
      state.ui.isScrubbing = false;
    },
    { signal },
  );

  // dragging outside progress bar while scrubbing
  window.addEventListener(
    "pointermove",
    (e) => {
      if (!state.ui.isScrubbing || !progressWrap) {
        return;
      }
      scrubToPointer(e.clientX, false);
    },
    { signal },
  );

  state.elements.video.addEventListener("click", showControls, { signal });

  const searchInput = document.querySelector("[data-episode-search]") as HTMLInputElement | null;
  const dropdown = document.querySelector("[data-episode-dropdown]") as HTMLElement | null;

  if (searchInput) {
    searchInput.addEventListener(
      "input",
      () => {
        clearTimeout(searchDebounce);
        // debounce to avoid excessive range switches while typing
        searchDebounce = window.setTimeout(() => {
          const val = searchInput.value.replaceAll(/\D/g, "");
          if (!val) {
            // clear: jump to current episode range
            const cur = Number.parseInt(state.episode.current, 10);
            switchEpisodeRange(Math.floor((cur - 1) / 100));
            updateEpisodeHighlight(cur);
            return;
          }
          const ep = Number.parseInt(val, 10);
          if (!ep || ep <= 0) {
            return;
          }
          const maxEp = state.episode.total > 0 ? state.episode.total : 500;
          const clamped = Math.min(ep, maxEp);
          searchInput.value = String(clamped);
          if (state.elements.episodeGrid) {
            switchEpisodeRange(Math.floor((clamped - 1) / 100));
            updateEpisodeHighlight(clamped);
          }
        }, 300);
      },
      { signal },
    );
  }

  // range buttons (100s of episodes)
  if (dropdown) {
    dropdown.querySelectorAll(".episode-range-btn").forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          const idx = Number.parseInt((btn as HTMLElement).dataset.rangeIndex ?? "0", 10);
          switchEpisodeRange(idx);
          const dd = btn.closest("ui-dropdown");
          if (isClosableDropdown(dd)) {
            dd.close();
          }
        },
        { signal },
      );
    });
  }

  // initial range for large episode lists
  if (state.elements.episodeGrid && state.episode.total > 100) {
    switchEpisodeRange(Math.floor((Number.parseInt(state.episode.current, 10) - 1) / 100));
  }

  window.setTimeout(() => {
    if (!signal.aborted) {
      hydrateAlternateMode(signal).catch((error) => {
        console.error("delayed alternate mode hydration failed:", error);
      });
    }
  }, 3000);

  document.body.addEventListener(
    "htmx:beforeSwap",
    (e: Event) => {
      const target = (e as CustomEvent).detail?.target as HTMLElement | null;
      if (target && currentContainer && target.contains(currentContainer)) {
        teardownPlayer();
      }
    },
    { signal },
  );
};

onReady(() => {
  initPlayer().catch((error) => {
    console.error("player initialization failed:", error);
  });
});
onHtmxLoad((root) => {
  if (root.matches("[data-video-player]") || root.querySelector("[data-video-player]")) {
    initPlayer().catch((error) => {
      console.error("player initialization after htmx load failed:", error);
    });
  }
});
