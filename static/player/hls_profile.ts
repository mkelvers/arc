import type { ErrorData } from "hls.js";

import Hls from "hls.js";

type HLSPlaybackProfile = {
  sourceLoads: number;
  manifestParsed: number;
  stalls: number;
  totalStallMs: number;
  seeks: number;
  totalSeekMs: number;
  errors: number;
  fatalErrors: number;
  lastErrorType: string;
};

declare global {
  interface Window {
    __malHlsProfile?: HLSPlaybackProfile;
  }
}

const createProfile = (): HLSPlaybackProfile => ({
  sourceLoads: 0,
  manifestParsed: 0,
  stalls: 0,
  totalStallMs: 0,
  seeks: 0,
  totalSeekMs: 0,
  errors: 0,
  fatalErrors: 0,
  lastErrorType: "",
});

const mark = (name: string): void => {
  performance.mark(`mal.hls.${name}`);
};

const measure = (name: string, startMark: string): void => {
  try {
    performance.measure(`mal.hls.${name}`, `mal.hls.${startMark}`);
  } catch (error) {
    // Missing marks can happen if HLS.js emits a later event after cleanup.
    console.debug("failed to measure performance:", error);
  }
};

export const attachHLSProfile = (hls: Hls, video: HTMLVideoElement): (() => void) => {
  const profile = createProfile();
  window.__malHlsProfile = profile;

  let stallStartedAt: number | null = null;
  let seekStartedAt: number | null = null;

  const onManifestLoading = (): void => {
    profile.sourceLoads += 1;
    mark("manifest_loading");
  };

  const onManifestParsed = (): void => {
    profile.manifestParsed += 1;
    measure("manifest_load", "manifest_loading");
  };

  const onHLSError = (_event: string, data: ErrorData): void => {
    profile.errors += 1;
    if (data.fatal) {
      profile.fatalErrors += 1;
    }
    profile.lastErrorType = data.type;
  };

  const onWaiting = (): void => {
    if (stallStartedAt !== null) {
      return;
    }
    stallStartedAt = performance.now();
    profile.stalls += 1;
    mark("stall_start");
  };

  const onPlaying = (): void => {
    if (stallStartedAt === null) {
      return;
    }
    profile.totalStallMs += performance.now() - stallStartedAt;
    stallStartedAt = null;
    measure("stall", "stall_start");
  };

  const onSeeking = (): void => {
    seekStartedAt = performance.now();
    mark("seek_start");
  };

  const onSeeked = (): void => {
    if (seekStartedAt === null) {
      return;
    }
    profile.seeks += 1;
    profile.totalSeekMs += performance.now() - seekStartedAt;
    seekStartedAt = null;
    measure("seek", "seek_start");
  };

  hls.on(Hls.Events.MANIFEST_LOADING, onManifestLoading);
  hls.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
  hls.on(Hls.Events.ERROR, onHLSError);
  video.addEventListener("waiting", onWaiting);
  video.addEventListener("playing", onPlaying);
  video.addEventListener("seeking", onSeeking);
  video.addEventListener("seeked", onSeeked);

  return () => {
    hls.off(Hls.Events.MANIFEST_LOADING, onManifestLoading);
    hls.off(Hls.Events.MANIFEST_PARSED, onManifestParsed);
    hls.off(Hls.Events.ERROR, onHLSError);
    video.removeEventListener("waiting", onWaiting);
    video.removeEventListener("playing", onPlaying);
    video.removeEventListener("seeking", onSeeking);
    video.removeEventListener("seeked", onSeeked);
  };
};
