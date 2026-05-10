import { state } from './state';
import { displayTimeFromAbsolute } from './timeline';
import { showControls } from './controls';
import { updateSubtitleOptions } from './subtitles';
import { updateQualityOptions } from './quality';

// builds stream URL with mode, token, and optional quality param
const streamUrlForMode = (mode: string, quality?: string): string => {
  const src = state.modeSources[mode];
  if (!src?.token) return '';
  let url = `${state.streamURL}?mode=${encodeURIComponent(mode)}&token=${encodeURIComponent(src.token)}`;
  if (quality && quality !== 'best') url += `&quality=${encodeURIComponent(quality)}`;
  return url;
};

// switches video src while preserving playback position
const loadVideo = (url: string): void => {
  if (!url) return;
  const wasPlaying = !state.video.paused;
  const prevTime = displayTimeFromAbsolute(state.video.currentTime);
  state.video.src = url;
  state.video.load();
  state.pendingSeekTime = prevTime; // restored in loadedmetadata handler
  if (wasPlaying) state.video.play().catch(() => {});
};

/**
 * Switches between sub/dub mode.
 * Saves preference to localStorage, reloads video src.
 */
export const switchMode = (mode: string): void => {
  if (!state.availableModes.includes(mode) || mode === state.currentMode) return;
  state.currentMode = mode;
  localStorage.setItem('player-audio-mode', mode);
  loadVideo(streamUrlForMode(mode, state.container.querySelector('[data-quality-select]')?.value));
  updateSubtitleOptions();
  updateQualityOptions();
  updateModeButtons();
};

/**
 * Updates dub/sub button styling based on current mode.
 * Disables unavailable modes.
 */
export const updateModeButtons = (): void => {
  const dub = state.container.querySelector('[data-mode-dub]') as HTMLButtonElement | null;
  const sub = state.container.querySelector('[data-mode-sub]') as HTMLButtonElement | null;
  const m = state.currentMode;

  dub?.classList.toggle('text-accent', m === 'dub');
  dub?.classList.toggle('text-white', m !== 'dub');
  dub?.classList.toggle('opacity-50', !state.availableModes.includes('dub'));
  dub?.classList.toggle('cursor-not-allowed', !state.availableModes.includes('dub'));
  dub && (dub.disabled = !state.availableModes.includes('dub'));

  sub?.classList.toggle('text-accent', m === 'sub');
  sub?.classList.toggle('text-white', m !== 'sub');
  sub?.classList.toggle('opacity-50', !state.availableModes.includes('sub'));
  sub?.classList.toggle('cursor-not-allowed', !state.availableModes.includes('sub'));
  sub && (sub.disabled = !state.availableModes.includes('sub'));
};

/**
 * Binds click handlers for mode buttons and autoplay toggle.
 */
export const setupMode = (): void => {
  const dub = state.container.querySelector('[data-mode-dub]') as HTMLButtonElement | null;
  const sub = state.container.querySelector('[data-mode-sub]') as HTMLButtonElement | null;

  dub?.addEventListener('click', () => {
    if (state.availableModes.includes('dub')) {
      switchMode('dub');
      showControls();
    }
  });
  sub?.addEventListener('click', () => {
    if (state.availableModes.includes('sub')) {
      switchMode('sub');
      showControls();
    }
  });

  const autoplayBtn = document.querySelector('[data-autoplay]') as HTMLInputElement | null;
  autoplayBtn?.addEventListener('change', e => {
    localStorage.setItem(
      'mal:autoplay-enabled',
      (e.target as HTMLInputElement).checked ? 'true' : 'false'
    );
    showControls();
  });
};
