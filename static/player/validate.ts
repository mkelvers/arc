import type { ModeSource, SkipSegment } from "./types";

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((item) => typeof item === "string");

export const isSubtitleItemArray = (v: unknown): v is { lang: string; token: string }[] =>
  Array.isArray(v) &&
  v.every(
    (item) => isRecord(item) && typeof item.lang === "string" && typeof item.token === "string",
  );

export const parseModeSources = (v: unknown): Record<string, ModeSource> => {
  if (!isRecord(v)) return {};
  const out: Record<string, ModeSource> = {};
  for (const [key, value] of Object.entries(v)) {
    if (!isRecord(value)) continue;
    if (typeof value.token !== "string" || value.token === "") continue;
    const subtitles = value.subtitles == null ? [] : value.subtitles;
    if (!isSubtitleItemArray(subtitles)) continue;
    const qualities = value.qualities;
    out[key] = {
      token: value.token,
      type: typeof value.type === "string" ? value.type : undefined,
      subtitles,
      qualities: isStringArray(qualities) ? qualities : undefined,
    };
  }
  return out;
};

export const parseSegments = (v: unknown): SkipSegment[] => {
  if (!Array.isArray(v)) return [];
  const out: SkipSegment[] = [];
  for (const item of v) {
    if (!isRecord(item)) continue;
    const type = typeof item.type === "string" ? item.type : "";
    const start = typeof item.start === "number" ? item.start : Number(item.start);
    const end = typeof item.end === "number" ? item.end : Number(item.end);
    const source = typeof item.source === "string" ? item.source : undefined;
    if (!type || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    out.push({ type, start, end, source });
  }
  return out;
};
