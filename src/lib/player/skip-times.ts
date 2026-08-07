export type SkipKind = 'opening' | 'ending';
export type SkipTimesSource = 'aniskip' | 'manual';

export interface SkipInterval {
  start: number;
  end: number;
}

export interface EpisodeSkipTimes {
  opening: SkipInterval | null;
  ending: SkipInterval | null;
  source: SkipTimesSource | null;
}

export interface SkipTimesDraft {
  opening: { start: number | null; end: number | null };
  ending: { start: number | null; end: number | null };
}

export function emptySkipTimes(): EpisodeSkipTimes {
  return { opening: null, ending: null, source: null };
}

export function skipTimesDraft(times: EpisodeSkipTimes): SkipTimesDraft {
  return {
    opening: {
      start: times.opening?.start ?? null,
      end: times.opening?.end ?? null,
    },
    ending: {
      start: times.ending?.start ?? null,
      end: times.ending?.end ?? null,
    },
  };
}

export function activeSkip(
  times: EpisodeSkipTimes,
  currentTime: number
): { kind: SkipKind; interval: SkipInterval } | null {
  for (const kind of ['opening', 'ending'] as const) {
    const interval = times[kind];
    if (interval && currentTime >= interval.start && currentTime < interval.end) {
      return { kind, interval };
    }
  }

  return null;
}
