import { state, initState } from "./state";
import { invalidateBounds, updateTimeline } from "./timeline";
import { setupControls, showControls } from "./controls";
import { setupKeyboard } from "./keyboard";
import { setupSubtitles, updateSubtitleOptions, updateSubtitleRender } from "./subtitles";
import { setupSkip, updateSkipButton, updateAutoSkipButton } from "./skip";
import { setupQuality, updateQualityOptions } from "./quality";
import { setupMode, updateModeButtons } from "./mode";
import { setupAutoplayButton, updateEpisodeHighlight, switchEpisodeRange } from "./episodes/ui";
import { goToNextEpisode } from "./episodes/nav";
import { resolveActiveSegments, renderSegments } from "./skip/segments";
import { setupSegmentEditor } from "./skip/editor";
import { setupThumbnails } from "./episodes/thumbnails";
import { markEpisodeTransition, setupProgress } from "./progress";
import { safeLocalStorage } from "./storage";
import {
  absoluteTimeFromDisplay,
  absoluteTimeFromRatio,
  getBounds,
  displayTimeFromAbsolute,
} from "./timeline";
import { formatTime } from "./controls";

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

  // build video src from mode, token, and saved quality preference
  // Only set if not already provided by the inline script during HTML parsing
  const preferredQuality = safeLocalStorage.getItem("mal:preferred-quality") || "best";
  const streamToken = state.modeSources[state.currentMode]?.token;
  if (!state.video.src && streamToken) {
    state.video.src = `${state.streamURL}?mode=${encodeURIComponent(state.currentMode)}&token=${encodeURIComponent(streamToken)}${preferredQuality !== "best" ? `&quality=${encodeURIComponent(preferredQuality)}` : ""}`;
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

    // resume from saved position
    const startTime = state.startTimeSeconds;
    if (startTime > 0 && state.video.currentTime <= 0.5 && getBounds().duration > startTime) {
      state.video.currentTime = absoluteTimeFromDisplay(startTime);
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
    if (state.shouldAutoPlay || state.video.paused) {
      state.video.play().catch(() => undefined);
    }

    updateTimeline(state.video.currentTime);
    updateSkipButton(state.video.currentTime);
  };

  state.video.addEventListener("loadedmetadata", onLoadedMetadata, { signal });
  // inline script runs during HTML parsing before initPlayer; if metadata
  // already loaded, fire the handler immediately
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
    },
    { signal },
  );

  state.video.addEventListener(
    "ended",
    () => {
      goToNextEpisode();
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
      const rect = progressWrap.getBoundingClientRect();
      state.video.currentTime = absoluteTimeFromRatio(
        Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      );
      updateTimeline(state.video.currentTime);
      updateSkipButton(state.video.currentTime);
      showControls();
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
      const rect = progressWrap.getBoundingClientRect();
      state.video.currentTime = absoluteTimeFromRatio(
        Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      );
      updateTimeline(state.video.currentTime);
      updateSkipButton(state.video.currentTime);
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
};

document.addEventListener("DOMContentLoaded", initPlayer);
document.body.addEventListener("htmx:afterSwap", (e: Event) => {
  const target = (e as CustomEvent).detail?.target as HTMLElement | null;
  if (target?.querySelector("[data-video-player]")) initPlayer();
});

document.body.addEventListener("htmx:beforeSwap", (e: Event) => {
  const target = (e as CustomEvent).detail?.target as HTMLElement | null;
  if (target && currentContainer && target.contains(currentContainer)) {
    teardownPlayer();
  }
});
