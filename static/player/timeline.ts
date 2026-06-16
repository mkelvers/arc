import type { TimelineBounds } from "./types";
import { state } from "./state";
import { formatTime } from "./controls";

// cached to avoid recalc on every timeupdate
let cachedBounds: TimelineBounds = { start: 0, end: 0, duration: 0 };
let cachedDuration = 0;
let cachedSeekableEnd = 0;

const getDuration = (): number =>
  Number.isFinite(state.elements.video.duration) && state.elements.video.duration > 0
    ? state.elements.video.duration
    : 0;

const getSeekableEnd = (): number => {
  const ranges = state.elements.video.seekable;
  if (!ranges || ranges.length <= 0) return 0;
  const end = ranges.end(ranges.length - 1);
  return Number.isFinite(end) && end > 0 ? end : 0;
};

/**
 * Computes timeline bounds from video.
 * Uses the full duration for VOD, and seekable ranges only when duration is unavailable.
 */
export const timelineBounds = (): TimelineBounds => {
  const duration = getDuration();
  if (duration > 0) {
    return { start: 0, end: duration, duration };
  }

  if (state.elements.video.seekable.length > 0) {
    const seekableStart = state.elements.video.seekable.start(0);
    const seekableEnd = state.elements.video.seekable.end(state.elements.video.seekable.length - 1);
    if (
      Number.isFinite(seekableStart) &&
      Number.isFinite(seekableEnd) &&
      seekableEnd > seekableStart
    ) {
      return {
        start: seekableStart,
        end: seekableEnd,
        duration: seekableEnd - seekableStart,
      };
    }
  }

  return { start: 0, end: duration, duration };
};

export const invalidateBounds = (): void => {
  cachedBounds = timelineBounds();
  cachedDuration = getDuration();
  cachedSeekableEnd = getSeekableEnd();
};

export const getBounds = (): TimelineBounds => {
  // lazy init + refresh: some streams expand seekable range over time (often tracks buffered end).
  // If we keep stale bounds, seeking past "watched/buffered" can map to only a fraction of the real timeline.
  const duration = getDuration();
  const seekableEnd = getSeekableEnd();
  if (
    cachedBounds.duration <= 0 ||
    duration !== cachedDuration ||
    seekableEnd !== cachedSeekableEnd
  ) {
    cachedBounds = timelineBounds();
    cachedDuration = duration;
    cachedSeekableEnd = seekableEnd;
  }
  return cachedBounds;
};

// converts video.currentTime to timeline-relative time (0-based for UI display)
export const displayTimeFromAbsolute = (absoluteTime: number): number => {
  const b = getBounds();
  if (!Number.isFinite(absoluteTime) || b.duration <= 0) return 0;
  return Math.max(b.start, Math.min(b.end, absoluteTime)) - b.start;
};

// converts timeline-relative time back to video time
export const absoluteTimeFromDisplay = (displayTime: number): number => {
  const b = getBounds();
  if (!Number.isFinite(displayTime) || b.duration <= 0) return 0;
  return b.start + Math.max(0, Math.min(b.duration, displayTime));
};

// converts 0-1 ratio to absolute video time
export const absoluteTimeFromRatio = (ratio: number): number => {
  const b = getBounds();
  if (!Number.isFinite(ratio) || b.duration <= 0) return 0;
  return b.start + Math.max(0, Math.min(1, ratio)) * b.duration;
};

// finds the end of the buffered region containing currentTime
export const getBufferedEnd = (): number => {
  const currentTime = state.elements.video.currentTime;
  let end = 0;
  // first: find buffered range that contains current time
  for (let i = 0; i < state.elements.video.buffered.length; i++) {
    if (
      state.elements.video.buffered.start(i) <= currentTime &&
      state.elements.video.buffered.end(i) >= currentTime
    ) {
      end = state.elements.video.buffered.end(i);
      break;
    }
  }
  // fallback: next buffered range after current time
  if (end === 0) {
    for (let i = 0; i < state.elements.video.buffered.length; i++) {
      if (state.elements.video.buffered.end(i) > currentTime) {
        end = Math.max(end, state.elements.video.buffered.end(i));
      }
    }
  }
  return end;
};

/**
 * Updates progress bar, scrubber position, and time displays.
 * Called on timeupdate, progress events, and seek.
 */
export const updateTimeline = (currentTime: number): void => {
  const { progress, scrubber, timeDisplay, durationDisplay, buffered } = state.elements;
  const b = getBounds();

  if (b.duration <= 0) {
    progress.style.width = "0%";
    buffered.style.width = "0%";
    scrubber.style.left = "0%";
    timeDisplay.textContent = "00:00";
    durationDisplay.textContent = "00:00";
    return;
  }

  const pct = (displayTimeFromAbsolute(currentTime) / b.duration) * 100;
  progress.style.width = `${pct}%`;
  scrubber.style.left = `${pct}%`;
  timeDisplay.textContent = formatTime(displayTimeFromAbsolute(currentTime));
  durationDisplay.textContent = formatTime(b.duration);

  // buffered region
  const bufferedEnd = getBufferedEnd();
  const bufferedPct = (displayTimeFromAbsolute(bufferedEnd) / b.duration) * 100;
  buffered.style.width = `${bufferedPct}%`;
};
