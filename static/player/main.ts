import { state, initState, showEndState, hideEndState } from "./state";
import { invalidateBounds, updateTimeline } from "./timeline";
import { setupControls, showControls } from "./controls";
import { setupKeyboard } from "./keyboard";
import { setupSubtitles, updateSubtitleOptions, updateSubtitleRender } from "./subtitles";
import { setupSkip, updateSkipButton, updateAutoSkipButton } from "./skip";
import { setupQuality, updateQualityOptions } from "./quality";
import { hydrateAlternateMode, setupMode, updateModeButtons } from "./mode";
import { setupAutoplayButton, updateEpisodeHighlight, switchEpisodeRange } from "./episodes/ui";
import { goToNextEpisode } from "./episodes/nav";
import { resolveActiveSegments, renderSegments } from "./skip/segments";
import { setupSegmentEditor } from "./skip/editor";
import { setupThumbnails } from "./episodes/thumbnails";
import { markEpisodeTransition, saveEndedProgress, setupProgress } from "./progress";
import { safeLocalStorage } from "./storage";
import { destroyVideoSource, loadVideoSource } from "./video";
import {
  absoluteTimeFromDisplay,
  absoluteTimeFromRatio,
  getBounds,
  displayTimeFromAbsolute,
} from "./timeline";
import { formatTime } from "./controls";
import { onHtmxLoad, onReady } from "../utils";

let currentContainer: HTMLElement | null = null;
let cleanup: (() => void) | null = null;

type ClosableDropdown = HTMLElement & { close: () => void };
const isClosableDropdown = (el: Element | null): el is ClosableDropdown => {
  if (!el) return false;
  if (!(el instanceof HTMLElement)) return false;
  const maybe = el as Partial<{ close: unknown }>;
  return typeof maybe.close === "function";
};

const hidePreviewPopover = (): void => {
  if (!state.previewPopover) return;
  state.previewPopover.classList.add("hidden");
  state.previewPopover.classList.add("opacity-0");
  state.previewPopover.classList.remove("opacity-100");
  state.previewPopover.style.left = "";
};

const showPreviewPopover = (): void => {
  if (!state.previewPopover) return;
  state.previewPopover.classList.remove("hidden");
  state.previewPopover.classList.remove("opacity-0");
  state.previewPopover.classList.add("opacity-100");
};

const teardownPlayer = (): void => {
  destroyVideoSource();
  cleanup?.();
  cleanup = null;
  currentContainer = null;
};

// updates time preview on progress bar hover
const updatePreviewUI = (ratio: number): void => {
  const progressWrap = state.container.querySelector("[data-progress-wrap]") as HTMLElement | null;
  if (!progressWrap || !state.previewPopover || !state.previewTime) {
    hidePreviewPopover();
    return;
  }
  const b = getBounds();
  if (b.duration <= 0) {
    hidePreviewPopover();
    return;
  }

  // show time for hovered position
  state.previewTime.textContent = formatTime(Math.max(0, Math.min(b.duration, ratio * b.duration)));

  const barWidth = progressWrap.clientWidth;
  if (barWidth <= 0) {
    hidePreviewPopover();
    return;
  }

  showPreviewPopover();
  // clamp to stay within bar bounds
  const popoverWidth = state.previewPopover.offsetWidth || 72;
  state.previewPopover.style.left = `${Math.max(popoverWidth / 2, Math.min(barWidth - popoverWidth / 2, ratio * barWidth))}px`;
};

const initPlayer = (): void => {
  const container = document.querySelector("[data-video-player]") as HTMLElement | null;
  if (!container) return;
  if (container === currentContainer) return;
  teardownPlayer();

  if (!initState(container)) {
    console.error("Video player markup is missing required controls.");
    return;
  }
  currentContainer = container;
  const abortController = new AbortController();
  const signal = abortController.signal;
  cleanup = () => abortController.abort();

  const loading = container.querySelector("[data-loading]") as HTMLElement | null;
  const progressWrap = container.querySelector("[data-progress-wrap]") as HTMLElement | null;

  const scrubToPointer = (clientX: number, shouldShowControls: boolean): void => {
    if (!progressWrap) return;
    const rect = progressWrap.getBoundingClientRect();
    state.video.currentTime = absoluteTimeFromRatio(
      Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    );
    updateTimeline(state.video.currentTime);
    updateSkipButton(state.video.currentTime);
    if (shouldShowControls) {
      showControls();
    }
  };

  // build video src from mode, token, and saved quality preference
  const preferredQuality = safeLocalStorage.getItem("mal:preferred-quality") || "best";
  const streamToken = state.modeSources[state.currentMode]?.token;
  if (streamToken) {
    const source = state.modeSources[state.currentMode];
    const url = `${state.streamURL}?mode=${encodeURIComponent(state.currentMode)}&token=${encodeURIComponent(streamToken)}${preferredQuality !== "best" ? `&quality=${encodeURIComponent(preferredQuality)}` : ""}`;
    loadVideoSource(url, source?.type);
  }

  setupProgress();
  setupControls();
  setupKeyboard();
  setupSkip();
  setupSegmentEditor();
  setupSubtitles();
  setupQuality();
  setupMode();

  updateSubtitleOptions();
  updateQualityOptions();
  updateModeButtons();
  setupAutoplayButton();
  updateAutoSkipButton();
  showControls();
  if (state.modeSwitchedFrom === "dub" && state.currentMode === "sub") {
    window.showToast?.({
      message: `Episode ${state.currentEpisode} is only available in sub, switched from dub.`,
    });
  }

  const onLoadedMetadata = (): void => {
    if (loading) {
      loading.style.display = "none";
    }
    invalidateBounds();

    resolveActiveSegments();
    renderSegments();

    // Resume from saved position
    const startTime = state.startTimeSeconds;
    const bounds = getBounds();
    const resumeTime = bounds.duration > 0 ? Math.min(startTime, bounds.duration) : 0;
    const isAtEnd = startTime > 0 && bounds.duration > 0 && startTime >= bounds.duration - 2;

    // Resume after a mode-switch page reload (best effort, session-scoped).
    const resumeAfterModeSwitch = (() => {
      try {
        const raw = sessionStorage.getItem("mal:resume-after-mode-switch");
        if (raw === null) return null;
        sessionStorage.removeItem("mal:resume-after-mode-switch");
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
      } catch {
        return null;
      }
    })();

    if (resumeAfterModeSwitch !== null) {
      const clamped = bounds.duration > 0 ? Math.min(resumeAfterModeSwitch, bounds.duration) : 0;
      if (clamped > 0) {
        state.video.currentTime = clamped;
      }
    }

    if (startTime > 0 && state.video.currentTime <= 2) {
      if (resumeTime > 0) {
        state.video.currentTime = absoluteTimeFromDisplay(resumeTime);
      }
    }
    // resume after mode switch
    if (state.pendingSeekTime !== null) {
      state.video.currentTime = absoluteTimeFromDisplay(state.pendingSeekTime);
      state.pendingSeekTime = null;
    }
    if (state.transitionEpisode === Number.parseInt(state.currentEpisode, 10)) {
      state.transitionEpisode = null;
    }
    // autoplay if not already playing (inline script may have already called play())
    // but don't autoplay if we've reached the end
    if (!isAtEnd && (state.shouldAutoPlay || state.video.paused)) {
      state.video.play().catch(() => undefined);
    }

    updateTimeline(state.video.currentTime);
    updateSkipButton(state.video.currentTime);

    // Apply end-state visuals if we resumed at the end
    if (isAtEnd) {
      showEndState();
    }
  };

  state.video.addEventListener("loadedmetadata", onLoadedMetadata, { signal });
  if (state.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    onLoadedMetadata();
  }

  state.video.addEventListener(
    "waiting",
    () => {
      if (loading) {
        loading.style.display = "flex";
      }
    },
    { signal },
  );
  state.video.addEventListener(
    "playing",
    () => {
      if (loading) {
        loading.style.display = "none";
      }
    },
    { signal },
  );
  // update progress bar during buffering
  state.video.addEventListener(
    "progress",
    () => {
      updateTimeline(state.video.currentTime);
    },
    { signal },
  );

  // main loop: update progress, subtitles, skip buttons
  state.video.addEventListener(
    "timeupdate",
    () => {
      updateTimeline(state.video.currentTime);
      updateSubtitleRender(displayTimeFromAbsolute(state.video.currentTime));
      updateSkipButton(state.video.currentTime);

      // Restore visibility if we've moved away from the end
      if (state.video.currentTime < state.video.duration - 1) {
        hideEndState();
      }
    },
    { signal },
  );

  state.video.addEventListener(
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
      if ("button" in e && e.button !== 0) return;
      state.isScrubbing = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture((e as PointerEvent).pointerId);
      } catch {}
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
      if (!progressWrap) return;
      state.isScrubbing = false;
    },
    { signal },
  );

  // dragging outside progress bar while scrubbing
  window.addEventListener(
    "pointermove",
    (e) => {
      if (!state.isScrubbing || !progressWrap) return;
      scrubToPointer(e.clientX, false);
    },
    { signal },
  );

  // track next-episode links outside the player so they start fresh after finishing an episode
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const url = new URL(anchor.href, location.origin);
      if (url.origin !== location.origin) return;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] !== "anime" || parts[2] !== "watch") return;
      if (Number.parseInt(parts[1], 10) !== state.malID) return;
      const nextEpisode = Number.parseInt(url.searchParams.get("ep") ?? "1", 10);
      const currentEpisode = Number.parseInt(state.currentEpisode, 10);
      if (nextEpisode === currentEpisode + 1) markEpisodeTransition(nextEpisode);
    },
    { signal },
  );

  state.video.addEventListener("click", showControls, { signal });

  const searchInput = document.querySelector("[data-episode-search]") as HTMLInputElement | null;
  const dropdown = document.querySelector("[data-episode-dropdown]") as HTMLElement | null;
  let searchDebounce: number | undefined;

  if (searchInput) {
    searchInput.addEventListener(
      "input",
      () => {
        clearTimeout(searchDebounce);
        // debounce to avoid excessive range switches while typing
        searchDebounce = window.setTimeout(() => {
          const val = searchInput.value.replace(/\D/g, "");
          if (!val) {
            // clear: jump to current episode range
            const cur = Number.parseInt(state.currentEpisode, 10);
            switchEpisodeRange(Math.floor((cur - 1) / 100));
            updateEpisodeHighlight(cur);
            return;
          }
          const ep = Number.parseInt(val, 10);
          if (!ep || ep <= 0) return;
          const maxEp = state.totalEpisodes > 0 ? state.totalEpisodes : 500;
          const clamped = Math.min(ep, maxEp);
          searchInput.value = String(clamped);
          if (state.episodeGrid) {
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
          if (isClosableDropdown(dd)) dd.close();
        },
        { signal },
      );
    });
  }

  // initial range for large episode lists
  if (state.episodeGrid && state.totalEpisodes > 100) {
    switchEpisodeRange(Math.floor((Number.parseInt(state.currentEpisode, 10) - 1) / 100));
  }

  setupThumbnails();
  void hydrateAlternateMode(signal);
};

onReady(initPlayer);
onHtmxLoad((root) => {
  if (root.matches("[data-video-player]") || root.querySelector("[data-video-player]")) {
    initPlayer();
  }
});

document.body.addEventListener("htmx:beforeSwap", (e: Event) => {
  const target = (e as CustomEvent).detail?.target as HTMLElement | null;
  if (target && currentContainer && target.contains(currentContainer)) {
    teardownPlayer();
  }
});
