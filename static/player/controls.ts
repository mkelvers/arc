import { state } from './state';
import { saveProgress } from './progress';
import { safeLocalStorage } from './storage';

export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Shows the controls overlay and schedules auto-hide after 2s if playing.
 */
export const showControls = (): void => {
  state.container.classList.add('show-controls');
  window.clearTimeout(state.playerControlsTimeout);
  state.playerControlsTimeout = window.setTimeout(() => {
    if (!state.isScrubbing && !state.video.paused) {
      state.container.classList.remove('show-controls');
    }
  }, 2000);
};

// seek relative to current position
export const seekBy = (delta: number): void => {
  if (state.video.duration <= 0) return;
  state.video.currentTime = Math.max(
    0,
    Math.min(state.video.duration, state.video.currentTime + delta)
  );
  showControls();
};

export const togglePlayPause = (): void => {
  if (state.video.paused) {
    state.video.play();
  } else {
    state.video.pause();
  }
};

// toggle mute, restoring previous volume
export const toggleMute = (): void => {
  if (state.video.muted || state.video.volume === 0) {
    const restored = state.lastKnownVolume > 0 ? state.lastKnownVolume : 1;
    state.video.muted = false;
    state.video.volume = restored;
  } else {
    state.lastKnownVolume = state.video.volume > 0 ? state.video.volume : state.lastKnownVolume;
    state.video.muted = true;
  }
};

// set volume (0-1), auto-unmute
export const setVolume = (value: number): void => {
  state.video.volume = Math.max(0, Math.min(1, value));
  state.video.muted = value === 0;
  if (value > 0) state.lastKnownVolume = value;
};

export const toggleFullscreen = (): void => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }
  state.container.requestFullscreen?.();
};

// syncs volume slider, underline, and mute icon
export const syncVolumeUI = (): void => {
  const { volumeRange, volumeUnderline } = getControls();
  const value = state.video.muted ? 0 : Math.round(state.video.volume * 100);
  if (volumeRange) {
    volumeRange.value = String(value);
    volumeRange.style.setProperty('--volume-percent', `${value}%`);
  }
  if (volumeUnderline) volumeUnderline.style.height = `${value}%`;
  updateMuteIcons(state.video.muted || state.video.volume === 0);
};

const VOLUME_STORAGE_KEY = 'player-volume';

const parseStoredVolume = (raw: string | null): number | null => {
  if (!raw) return null;
  const v = Number.parseFloat(raw);
  if (!Number.isFinite(v)) return null;
  if (v < 0 || v > 1) return null;
  return v;
};

const applyStoredVolume = (): void => {
  const stored = parseStoredVolume(safeLocalStorage.getItem(VOLUME_STORAGE_KEY));
  if (stored === null) return;

  state.video.volume = stored;
  state.video.muted = stored === 0;
  if (stored > 0) state.lastKnownVolume = stored;
};

let volumeSaveTimer: number | undefined;
const schedulePersistVolume = (): void => {
  window.clearTimeout(volumeSaveTimer);
  volumeSaveTimer = window.setTimeout(() => {
    if (!Number.isFinite(state.video.volume)) return;
    const clamped = Math.max(0, Math.min(1, state.video.volume));
    safeLocalStorage.setItem(VOLUME_STORAGE_KEY, clamped.toFixed(3));
  }, 250);
};

interface Controls {
  playPause: HTMLButtonElement | null;
  muteBtn: HTMLButtonElement | null;
  volumePanel: HTMLElement | null;
  volumeRange: HTMLInputElement | null;
  volumeUnderline: HTMLElement | null;
  backwardBtn: HTMLButtonElement | null;
  forwardBtn: HTMLButtonElement | null;
  fullscreenBtn: HTMLButtonElement | null;
  iconPlay: SVGElement | null;
  iconPause: SVGElement | null;
  iconVolume: SVGElement | null;
  iconMuted: SVGElement | null;
  skipSegmentBtn: HTMLButtonElement | null;
  subtitleText: HTMLElement | null;
  autoplayBtn: HTMLInputElement | null;
}

let controlsCache: Controls | null = null;

const getControls = (): Controls => {
  if (controlsCache) return controlsCache;
  const c = state.container;
  controlsCache = {
    playPause: c.querySelector('[data-play-pause]'),
    muteBtn: c.querySelector('[data-mute]'),
    volumePanel: c.querySelector('[data-volume-panel]'),
    volumeRange: c.querySelector('[data-volume-range]'),
    volumeUnderline: c.querySelector('[data-volume-underline]'),
    backwardBtn: c.querySelector('[data-backward]'),
    forwardBtn: c.querySelector('[data-forward]'),
    fullscreenBtn: c.querySelector('[data-fullscreen]'),
    iconPlay: c.querySelector('[data-icon-play]'),
    iconPause: c.querySelector('[data-icon-pause]'),
    iconVolume: c.querySelector('[data-icon-volume]'),
    iconMuted: c.querySelector('[data-icon-muted]'),
    skipSegmentBtn: c.querySelector('[data-skip]'),
    subtitleText: c.querySelector('[data-subtitle-text]'),
    autoplayBtn: document.querySelector('[data-autoplay]'),
  };
  return controlsCache;
};

const updatePlayPauseIcons = (isPlaying: boolean): void => {
  const { iconPlay, iconPause } = getControls();
  iconPlay?.classList.toggle('hidden', isPlaying);
  iconPause?.classList.toggle('hidden', !isPlaying);
};

const updateMuteIcons = (isMuted: boolean): void => {
  const { iconVolume, iconMuted } = getControls();
  iconVolume?.classList.toggle('hidden', isMuted);
  iconMuted?.classList.toggle('hidden', !isMuted);
};

/**
 * Binds click handlers to player control buttons.
 * Sets up video event listeners for icon sync.
 */
export const setupControls = (): void => {
  applyStoredVolume();

  const {
    playPause,
    muteBtn,
    volumePanel,
    volumeRange,
    backwardBtn,
    forwardBtn,
    fullscreenBtn,
    skipSegmentBtn,
  } = getControls();

  // play/pause on button and video click
  playPause?.addEventListener('click', () => {
    togglePlayPause();
    showControls();
  });
  state.video.addEventListener('click', () => {
    togglePlayPause();
    showControls();
  });

  muteBtn?.addEventListener('click', () => {
    toggleMute();
    showControls();
  });

  // volume slider
  volumeRange?.addEventListener('input', () => {
    const value = Number(volumeRange.value) / 100;
    setVolume(value);
    showControls();
  });
  // dragging class for visual feedback
  volumeRange?.addEventListener('pointerdown', () => volumePanel?.classList.add('is-dragging'));
  window.addEventListener('pointerup', () => volumePanel?.classList.remove('is-dragging'));

  backwardBtn?.addEventListener('click', () => seekBy(-10));
  forwardBtn?.addEventListener('click', () => seekBy(10));

  fullscreenBtn?.addEventListener('click', () => {
    toggleFullscreen();
    showControls();
  });

  // skip intro/outro button
  skipSegmentBtn?.addEventListener('click', () => {
    if (!state.activeSkipSegment) return;
    state.video.currentTime = state.activeSkipSegment.end + 0.01;
    showControls();
  });

  // fullscreen change handler
  document.addEventListener('fullscreenchange', () => {
    state.isFullscreen = !!document.fullscreenElement;
    state.container.classList.toggle('fullscreen', state.isFullscreen);
    if (state.isFullscreen) showControls();
  });

  // icon sync on state changes
  state.video.addEventListener('play', () => {
    updatePlayPauseIcons(true);
    showControls();
  });
  state.video.addEventListener('pause', () => {
    updatePlayPauseIcons(false);
    showControls();
    void saveProgress();
  });
  state.video.addEventListener('volumechange', () => {
    syncVolumeUI();
    schedulePersistVolume();
  });

  // mouse move in container shows controls
  state.container.addEventListener('mousemove', showControls);

  // initial sync — check actual video state since inline script may have started playback
  updatePlayPauseIcons(!state.video.paused);
  syncVolumeUI();
};
