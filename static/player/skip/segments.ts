import { state } from '../state';

// filter bounds for valid segments
const MIN_SEGMENT_DURATION = 20; // at least 20s
const MAX_SEGMENT_DURATION = 240; // at most 4 min
const MAX_INTRO_START = 180; // intro must start before 3min
const MIN_OUTRO_START_RATIO = 0.5; // outro must start at least 50% in

/**
 * Filters parsed segments to only those within video bounds and sensible duration.
 * Validates intro/outro positioning.
 */
export const resolveActiveSegments = (): void => {
  const bounds = state.video.duration;
  if (bounds <= 0) {
    state.activeSegments = [];
    return;
  }

  const normalizeType = (t: string): 'op' | 'ed' | null => {
    const v = (t || '').toLowerCase();
    if (v === 'op' || v === 'opening' || v === 'intro') return 'op';
    if (v === 'ed' || v === 'ending' || v === 'outro') return 'ed';
    return null;
  };

  state.activeSegments = state.parsedSegments.filter(s => {
    const t = normalizeType(s.type);
    if (!t) return false;

    const len = s.end - s.start;
    // duration filter
    if (len < MIN_SEGMENT_DURATION || len > MAX_SEGMENT_DURATION) return false;
    // bounds check
    if (s.start < 0 || s.end <= s.start || s.end > bounds + 1) return false;

    // intro: starts early, before 50% of video
    if (t === 'op') {
      return s.start <= MAX_INTRO_START && s.start <= bounds * 0.5;
    }
    // outro: starts in second half of video
    if (t === 'ed') {
      return s.start >= bounds * MIN_OUTRO_START_RATIO;
    }
    return false;
  });
};

/**
 * Renders segment markers on the timeline progress bar.
 */
export const renderSegments = (): void => {
  const track = state.container.querySelector('[data-segments]') as HTMLElement | null;
  if (!track) return;
  track.innerHTML = '';

  const bounds = state.video.duration;
  if (bounds <= 0) return;

  // create clearly visible colored bars for each segment
  state.activeSegments.forEach(s => {
    const bar = document.createElement('div');
    // use distinct colors so segments are readable over buffered/progress fills
    bar.className = 'absolute top-0 h-full opacity-95';
    // single color for OP/ED, rendered above buffered/progress fills
    bar.classList.add('bg-amber-300/90');
    bar.style.left = `${(s.start / bounds) * 100}%`;
    bar.style.width = `${((s.end - s.start) / bounds) * 100}%`;
    track.appendChild(bar);
  });
};
