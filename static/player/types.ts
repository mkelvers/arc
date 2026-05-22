// stream source for a single mode (sub/dub)
export interface ModeSource {
  token: string;
  subtitles: SubtitleItem[];
  qualities?: string[];
}

// subtitle track from backend
export interface SubtitleItem {
  lang: string;
  token: string;
}

// skip segment (intro/outro) from backend data attribute
export interface SkipSegment {
  type: string; // 'op' or 'ed'
  start: number;
  end: number;
  source?: string;
}

// parsed subtitle cue from VTT
export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

// loaded subtitle track for UI
export interface SubtitleTrack {
  lang: string;
  label: string;
  url: string;
}

// validated skip segment within video bounds
export interface ActiveSegment {
  type: string;
  start: number;
  end: number;
  source?: string;
}

// timeline range (handles seekable ranges in live streams)
export interface TimelineBounds {
  start: number;
  end: number;
  duration: number;
}
