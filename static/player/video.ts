import Hls from "hls.js";
import { attachHLSProfile } from "./hls_profile";
import { state } from "./state";
import { absoluteTimeFromDisplay, displayTimeFromAbsolute, invalidateBounds } from "./timeline";

let hls: Hls | null = null;
let stopHLSProfile: (() => void) | null = null;

const destroyHLS = (): void => {
  stopHLSProfile?.();
  stopHLSProfile = null;
  hls?.destroy();
  hls = null;
};

export const destroyVideoSource = (): void => {
  destroyHLS();
  state.elements.video.pause();
  state.elements.video.removeAttribute("src");
  state.elements.video.load();
};

const shouldUseHLS = (type: string | undefined, url: string): boolean => {
  if (type === "m3u8") return true;
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.searchParams.get("hls") === "1") return true;
    return parsed.pathname.toLowerCase().endsWith(".m3u8");
  } catch (error) {
    console.error("Failed to parse video URL:", error);
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

  const wasPlaying = !state.elements.video.paused;
  const prevDisplayTime = displayTimeFromAbsolute(state.elements.video.currentTime);

  // Fully reset the element before setting a new source.
  destroyVideoSource();

  if (shouldUseHLS(type, url) && Hls.isSupported()) {
    hls = new Hls();
    stopHLSProfile = attachHLSProfile(hls, state.elements.video);
    hls.loadSource(url);
    hls.attachMedia(state.elements.video);
  } else {
    state.elements.video.src = url;
    state.elements.video.load();
  }

  // Try an eager seek; if metadata isn't ready yet, main.ts will restore via pendingSeekTime.
  state.playback.pendingSeekTime = prevDisplayTime;
  if (state.elements.video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    invalidateBounds();
    state.elements.video.currentTime = absoluteTimeFromDisplay(prevDisplayTime);
    state.playback.pendingSeekTime = null;
  }

  if (wasPlaying) {
    state.elements.video.play().catch((error) => {
      console.debug("failed to play video:", error);
    });
  }
};
