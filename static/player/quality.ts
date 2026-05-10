import { state } from './state';
import { displayTimeFromAbsolute, absoluteTimeFromDisplay } from './timeline';

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
  if (wasPlaying) state.video.play().catch(() => {});
};

export const switchQuality = (quality: string): void => {
  const url = streamUrlForMode(state.currentMode, quality);
  if (!url) return;
  localStorage.setItem('mal:preferred-quality', quality);
  loadVideo(url);
};

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

  const preferred = localStorage.getItem('mal:preferred-quality') || 'best';
  select.value = qualities.includes(preferred) ? preferred : 'best';

  const wrapper = select.parentElement;
  wrapper?.classList.toggle('hidden', qualities.length === 0);
};

export const setupQuality = (): void => {
  const select = state.container.querySelector('[data-quality-select]') as HTMLSelectElement | null;
  select?.addEventListener('change', e => {
    switchQuality((e.target as HTMLSelectElement).value);
  });
};
