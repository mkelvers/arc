// stream source for a single mode (sub/dub)
export type ModeSource = {
  token: string;
  type?: string;
  subtitles: SubtitleItem[];
  qualities?: string[];
};

// subtitle track from backend
type SubtitleItem = { lang: string; token: string };

// skip segment (intro/outro) from backend data attribute
export type SkipSegment = {
  type: string; // 'op' or 'ed'
  start: number;
  end: number;
  source?: string;
};

// parsed subtitle cue from VTT
export type SubtitleCue = { start: number; end: number; text: string };

// loaded subtitle track for UI
export type SubtitleTrack = { lang: string; label: string; url: string };

// validated skip segment within video bounds
export type ActiveSegment = { type: string; start: number; end: number; source?: string };

// timeline range (handles seekable ranges in live streams)
export type TimelineBounds = { start: number; end: number; duration: number };
