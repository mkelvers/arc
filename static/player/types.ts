export interface ModeSource {
  token: string;
  subtitles: SubtitleItem[];
  qualities?: string[];
}

export interface SubtitleItem {
  lang: string;
  token: string;
}

export interface SkipSegment {
  type: string;
  start: number;
  end: number;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface SubtitleTrack {
  lang: string;
  label: string;
  url: string;
}

export interface ActiveSegment {
  type: string;
  start: number;
  end: number;
}

export interface TimelineBounds {
  start: number;
  end: number;
  duration: number;
}
