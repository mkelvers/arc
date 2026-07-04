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
  if (type === "m3u8") {
    return true;
  }
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.searchParams.get("hls") === "1") {
      return true;
    }
    return parsed.pathname.toLowerCase().endsWith(".m3u8");
  } catch (error) {
    console.error("Failed to parse video URL:", error);
    return url.toLowerCase().includes(".m3u8");
  }
};

/**
 * Force-loads a new video source and preserves playback position.
 *
 * Some browsers can be flaky when switching between HLS URLs while playing. Clearing `src` first
 * ensures the media element fully resets before the new URL is set.
 */
export const loadVideoSource = (
  url: string,
  type?: string,
  startTimeSeconds?: number,
  preservePosition: boolean = true,
): void => {
  if (!url) {
    return;
  }

  const wasPlaying = !state.elements.video.paused;
  const prevDisplayTime = displayTimeFromAbsolute(state.elements.video.currentTime);
  const shouldPreservePosition = preservePosition && prevDisplayTime > 0;

  // Fully reset the element before setting a new source.
  destroyVideoSource();

  if (shouldUseHLS(type, url) && Hls.isSupported()) {
    hls = new Hls({
      autoStartLoad: false,
      backBufferLength: 30,
      maxBufferLength: 18,
      maxMaxBufferLength: 30,
      maxBufferSize: 20 * 1000 * 1000,
      startFragPrefetch: false,
    });
    stopHLSProfile = attachHLSProfile(hls, state.elements.video);
    hls.loadSource(url);
    hls.attachMedia(state.elements.video);
    hls.once(Hls.Events.MEDIA_ATTACHED, () => {
      const startPosition =
        startTimeSeconds !== undefined && Number.isFinite(startTimeSeconds) && startTimeSeconds > 0
          ? startTimeSeconds
          : -1;
      hls?.startLoad(startPosition);
    });
  } else {
    state.elements.video.src = url;
    state.elements.video.load();
  }

  // Preserve position only when switching away from an existing playback state.
  // On initial load, a zero pending seek would overwrite server-provided resume time.
  state.playback.pendingSeekTime = shouldPreservePosition ? prevDisplayTime : null;
  if (shouldPreservePosition && state.elements.video.readyState >= HTMLMediaElement.HAVE_METADATA) {
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
