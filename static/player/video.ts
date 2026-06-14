import Hls from "hls.js";
import { state } from "./state";
import { absoluteTimeFromDisplay, displayTimeFromAbsolute, invalidateBounds } from "./timeline";

let hls: Hls | null = null;

const destroyHLS = (): void => {
  hls?.destroy();
  hls = null;
};

export const destroyVideoSource = (): void => {
  destroyHLS();
  state.video.pause();
  state.video.removeAttribute("src");
  state.video.load();
};

const shouldUseHLS = (type: string | undefined, url: string): boolean => {
  if (type === "m3u8") return true;
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.searchParams.get("hls") === "1") return true;
    return parsed.pathname.toLowerCase().endsWith(".m3u8");
  } catch {
    return url.toLowerCase().includes(".m3u8");
  }
};

/**
 * Force-loads a new video source and preserves playback position.
 *
 * Some browsers can be flaky when switching between HLS URLs while playing.
 * Clearing `src` first ensures the media element fully resets before the new URL is set.
 */
export const loadVideoSource = (url: string, type?: string): void => {
  if (!url) return;

  const wasPlaying = !state.video.paused;
  const prevDisplayTime = displayTimeFromAbsolute(state.video.currentTime);

  // Fully reset the element before setting a new source.
  destroyVideoSource();

  if (shouldUseHLS(type, url) && Hls.isSupported()) {
    hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(state.video);
  } else {
    state.video.src = url;
    state.video.load();
  }

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
