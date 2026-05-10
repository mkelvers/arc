import { state, initState } from './state';
import { invalidateBounds, updateTimeline } from './timeline';
import { setupControls, showControls } from './controls';
import { setupKeyboard } from './keyboard';
import { setupSubtitles, updateSubtitleOptions, updateSubtitleRender } from './subtitles';
import { setupSkip, updateSkipButton, updateAutoSkipButton } from './skip';
import { setupQuality, updateQualityOptions } from './quality';
import { setupMode, updateModeButtons } from './mode';
import { setupAutoplayButton, updateEpisodeHighlight, switchEpisodeRange } from './episodes/ui';
import { goToNextEpisode } from './episodes/nav';
import { resolveActiveSegments, renderSegments } from './skip/segments';
import { setupThumbnails } from './episodes/thumbnails';
import { markEpisodeTransition, setupProgress } from './progress';
import { absoluteTimeFromRatio, getBounds, displayTimeFromAbsolute } from './timeline';
import { formatTime } from './controls';

let initialized = false; // prevent double init on htmx swaps

const hidePreviewPopover = (): void => {
  state.previewPopover?.classList.remove('block');
  state.previewPopover?.classList.add('hidden');
  state.previewPopover!.style.left = '0px';
};

const showPreviewPopover = (): void => {
  state.previewPopover?.classList.remove('hidden');
  state.previewPopover?.classList.add('block');
};

// updates time preview on progress bar hover
const updatePreviewUI = (ratio: number): void => {
  const progressWrap = state.container.querySelector('[data-progress-wrap]') as HTMLElement | null;
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
  const container = document.querySelector('[data-video-player]') as HTMLElement | null;
  if (!container || initialized) return;
  initialized = true;

  initState(container);

  const loading = container.querySelector('[data-loading]') as HTMLElement | null;
  const progressWrap = container.querySelector('[data-progress-wrap]') as HTMLElement | null;

  // build video src from mode, token, and saved quality preference
  const preferredQuality = localStorage.getItem('mal:preferred-quality') || 'best';
  const streamToken = state.modeSources[state.currentMode]?.token;
  if (streamToken) {
    state.video.src = `${state.streamURL}?mode=${encodeURIComponent(state.currentMode)}&token=${encodeURIComponent(streamToken)}${preferredQuality !== 'best' ? `&quality=${encodeURIComponent(preferredQuality)}` : ''}`;
  }

  setupProgress();
  setupControls();
  setupKeyboard();
  setupSkip();
  setupSubtitles();
  setupQuality();
  setupMode();

  updateSubtitleOptions();
  updateQualityOptions();
  updateModeButtons();
  setupAutoplayButton();
  updateAutoSkipButton();
  showControls();

  state.video.addEventListener('loadedmetadata', () => {
    loading && (loading.style.display = 'none');
    invalidateBounds();

    resolveActiveSegments();
    renderSegments();

    // resume from saved position
    const startTime = Number(container.dataset.startTimeSeconds ?? '0');
    if (startTime > 0 && state.video.currentTime <= 0.5 && state.video.duration > startTime) {
      state.video.currentTime = startTime;
    }
    // resume after mode switch
    if (state.pendingSeekTime !== null) {
      state.video.currentTime = state.pendingSeekTime;
      state.pendingSeekTime = null;
    }
    if (state.shouldAutoPlay) state.video.play().catch(() => {});

    updateTimeline(state.video.currentTime);
    updateSkipButton(state.video.currentTime);
  });

  state.video.addEventListener('waiting', () => {
    loading && (loading.style.display = 'flex');
  });
  state.video.addEventListener('playing', () => {
    loading && (loading.style.display = 'none');
  });
  // update progress bar during buffering
  state.video.addEventListener('progress', () => {
    updateTimeline(state.video.currentTime);
  });

  // main loop: update progress, subtitles, skip buttons
  state.video.addEventListener('timeupdate', () => {
    updateTimeline(state.video.currentTime);
    updateSubtitleRender(displayTimeFromAbsolute(state.video.currentTime));
    updateSkipButton(state.video.currentTime);
  });

  state.video.addEventListener('ended', () => {
    goToNextEpisode();
  });

  // click to seek
  progressWrap?.addEventListener('mousedown', e => {
    state.isScrubbing = true;
    const rect = progressWrap.getBoundingClientRect();
    state.video.currentTime = absoluteTimeFromRatio(
      Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    );
    updateTimeline(state.video.currentTime);
    updateSkipButton(state.video.currentTime);
    showControls();
  });

  // hover to preview time
  progressWrap?.addEventListener('mousemove', e => {
    const rect = progressWrap.getBoundingClientRect();
    updatePreviewUI(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  });

  progressWrap?.addEventListener('mouseleave', hidePreviewPopover);

  // dragging outside progress bar while scrubbing
  window.addEventListener('mousemove', e => {
    if (!state.isScrubbing || !progressWrap) return;
    const rect = progressWrap.getBoundingClientRect();
    state.video.currentTime = absoluteTimeFromRatio(
      Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    );
    updateTimeline(state.video.currentTime);
    updateSkipButton(state.video.currentTime);
  });

  // track episode transitions from external links
  container.addEventListener('click', e => {
    const anchor = (e.target as Node).parentElement?.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const parts = new URL(anchor.href, location.origin).pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch' && Number.parseInt(parts[2], 10) > 0) {
      markEpisodeTransition(Number.parseInt(parts[2], 10));
    }
  });

  state.video.addEventListener('click', showControls);

  const searchInput = document.querySelector('[data-episode-search]') as HTMLInputElement | null;
  const dropdown = container.querySelector('[data-episode-dropdown]') as HTMLElement | null;
  let searchDebounce: number | undefined;

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      // debounce to avoid excessive range switches while typing
      searchDebounce = window.setTimeout(() => {
        const val = searchInput.value.replace(/\D/g, '');
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
    });
  }

  // range buttons (100s of episodes)
  if (dropdown) {
    dropdown.querySelectorAll('.episode-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number.parseInt((btn as HTMLElement).dataset.rangeIndex ?? '0', 10);
        switchEpisodeRange(idx);
      });
    });
  }

  // initial range for large episode lists
  if (state.episodeGrid && state.totalEpisodes > 100) {
    switchEpisodeRange(Math.floor((Number.parseInt(state.currentEpisode, 10) - 1) / 100));
  }

  setupThumbnails();
};

document.addEventListener('DOMContentLoaded', initPlayer);
document.body.addEventListener('htmx:afterSwap', (e: Event) => {
  const target = (e as CustomEvent).detail?.target as HTMLElement | null;
  if (target?.querySelector('[data-video-player]')) initPlayer();
});
