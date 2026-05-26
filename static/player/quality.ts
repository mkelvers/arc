import { state } from './state';
import { displayTimeFromAbsolute } from './timeline';
import { safeLocalStorage } from './storage';

// same as mode.ts - could be extracted to shared util
const streamUrlForMode = (mode: string, quality?: string): string => {
  const src = state.modeSources[mode];
  if (!src?.token) return '';
  let url = `${state.streamURL}?mode=${encodeURIComponent(mode)}&token=${encodeURIComponent(src.token)}`;
  if (quality && quality !== 'best') url += `&quality=${encodeURIComponent(quality)}`;
  return url;
};

const loadVideo = (url: string): void => {
  if (!url) return;
  const wasPlaying = !state.video.paused;
  const prevTime = displayTimeFromAbsolute(state.video.currentTime);
  state.video.src = url;
  state.video.load();
  state.pendingSeekTime = prevTime;
  if (wasPlaying) {
    state.video.play().catch(() => undefined);
  }
};

/**
 * Switches video quality (resolution).
 * Persists preference to localStorage.
 */
export const switchQuality = (quality: string): void => {
  const url = streamUrlForMode(state.currentMode, quality);
  if (!url) return;
  safeLocalStorage.setItem('mal:preferred-quality', quality);
  loadVideo(url);
};

/**
 * Rebuilds quality dropdown options from current mode's available qualities.
 * Shows/hides dropdown based on availability.
 */
export const updateQualityOptions = (): void => {
  const select = state.container.querySelector('[data-quality-select]') as HTMLSelectElement | null;
  if (!select) return;
  const qualities = state.modeSources[state.currentMode]?.qualities ?? [];
  select.innerHTML = '';

  const best = document.createElement('option');
  best.value = 'best';
  best.textContent = 'Auto / Best';
  select.appendChild(best);

  qualities.forEach(q => {
    const opt = document.createElement('option');
    opt.value = q;
    opt.textContent = q;
    select.appendChild(opt);
  });

  // restore saved preference
  const preferred = safeLocalStorage.getItem('mal:preferred-quality') || 'best';
  select.value = qualities.includes(preferred) ? preferred : 'best';

  // hide if no quality options
  const wrapper = select.parentElement;
  wrapper?.classList.toggle('hidden', qualities.length === 0);
};

/**
 * Binds quality select change handler.
 */
export const setupQuality = (): void => {
  const select = state.container.querySelector('[data-quality-select]') as HTMLSelectElement | null;
  select?.addEventListener('change', e => {
    switchQuality((e.target as HTMLSelectElement).value);
  });
};
