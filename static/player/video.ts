import { state } from "./state";
import { absoluteTimeFromDisplay, displayTimeFromAbsolute, invalidateBounds } from "./timeline";

/**
 * Force-loads a new video source and preserves playback position.
 *
 * Some browsers can be flaky when switching between HLS URLs while playing.
 * Clearing `src` first ensures the media element fully resets before the new URL is set.
 */
export const loadVideoSource = (url: string): void => {
  if (!url) return;

  const wasPlaying = !state.video.paused;
  const prevDisplayTime = displayTimeFromAbsolute(state.video.currentTime);

  // Fully reset the element before setting a new source.
  state.video.pause();
  state.video.removeAttribute("src");
  state.video.load();

  state.video.src = url;
  state.video.load();

  // Try an eager seek; if metadata isn't ready yet, main.ts will restore via pendingSeekTime.
  state.pendingSeekTime = prevDisplayTime;
  if (state.video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    invalidateBounds();
    state.video.currentTime = absoluteTimeFromDisplay(prevDisplayTime);
    state.pendingSeekTime = null;
  }

  if (wasPlaying) {
    state.video.play().catch(() => undefined);
  }
};

