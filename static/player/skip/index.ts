import { state } from '../state';
import { displayTimeFromAbsolute, absoluteTimeFromDisplay } from '../timeline';
import { showControls } from '../controls';
import { resolveActiveSegments, renderSegments } from './segments';

const skipLabel = (type: string): string => (type === 'ed' ? 'Skip outro' : 'Skip intro');

export const updateSkipButton = (currentTime: number): void => {
  const btn = state.container.querySelector('[data-skip]') as HTMLButtonElement | null;
  const displayTime = displayTimeFromAbsolute(currentTime);

  const segment = state.activeSegments.find(s => {
    const delay = Math.min(1, Math.max(0.25, (s.end - s.start) * 0.02));
    return displayTime >= s.start + delay && displayTime < s.end;
  });

  if (!segment) {
    state.activeSkipSegment = null;
    btn?.classList.add('hidden');
    return;
  }

  const autoSkip = localStorage.getItem('mal:autoskip-enabled') === 'true';
  if (autoSkip && displayTime >= segment.start && displayTime < segment.end) {
    state.video.currentTime = absoluteTimeFromDisplay(segment.end + 0.01);
    return;
  }

  state.activeSkipSegment = segment;
  if (btn) {
    btn.textContent = skipLabel(segment.type);
    btn.title = skipLabel(segment.type);
    btn.classList.remove('hidden');
  }
};

export const updateAutoSkipButton = (): void => {
  const btn = document.querySelector('[data-autoskip]') as HTMLInputElement | null;
  btn && (btn.checked = localStorage.getItem('mal:autoskip-enabled') === 'true');
};

export const setupSkip = (): void => {
  document.addEventListener('change', e => {
    const target = e.target as HTMLElement;
    if (target.hasAttribute('data-autoskip')) {
      localStorage.setItem(
        'mal:autoskip-enabled',
        (target as HTMLInputElement).checked ? 'true' : 'false'
      );
      showControls();
    }
  });
};
