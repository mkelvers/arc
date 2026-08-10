import type { AudioMode } from '$lib/anime/audio';
import {
  isSubtitleSize,
  subtitleSizeOrder,
  subtitleSizes,
  type Sources,
  type SubtitleSize,
} from './media';

type Key =
  | 'audio-mode'
  | 'autoplay'
  | 'quality'
  | 'volume'
  | 'subtitles'
  | 'subtitle-size';

export function load(sources: Sources, qualities: string[]) {
  const rawVolume = localStorage.getItem('arc:volume');
  const volume = rawVolume === null ? null : Number(rawVolume);
  const rawMode = localStorage.getItem('arc:audio-mode');
  const mode: AudioMode | null =
    (rawMode === 'sub' || rawMode === 'dub' || rawMode === 'raw') && sources[rawMode]?.length
      ? rawMode
      : null;
  const rawAutoplay = localStorage.getItem('arc:autoplay');
  const autoplay =
    rawAutoplay === 'true' || rawAutoplay === 'false' ? rawAutoplay === 'true' : null;
  const rawQuality = localStorage.getItem('arc:quality');
  const quality =
    rawQuality === 'best' || qualities.includes(rawQuality ?? '') || /^\d+p$/.test(rawQuality ?? '')
      ? (rawQuality ?? 'best')
      : null;
  const rawSubtitles = localStorage.getItem('arc:subtitles');
  const subtitleEnabled =
    rawSubtitles === 'false' || rawSubtitles === 'off'
      ? false
      : rawSubtitles === 'true' ||
          rawSubtitles === 'on' ||
          rawSubtitles === 'merge' ||
          rawSubtitles === 'dub' ||
          rawSubtitles === 'sub'
        ? true
        : null;
  const rawSize = localStorage.getItem('arc:subtitle-size');
  const parsedSize = rawSize !== null ? Number(rawSize) : NaN;
  // Preset names save directly; px numbers from the old size slider resolve
  // to the nearest preset so those saves survive.
  const subtitleSize: SubtitleSize | null = isSubtitleSize(rawSize)
    ? rawSize
    : Number.isFinite(parsedSize)
      ? subtitleSizeOrder.reduce(
          (nearest, size) =>
            Math.abs(subtitleSizes[size].px - parsedSize) <
            Math.abs(subtitleSizes[nearest].px - parsedSize)
              ? size
              : nearest,
          subtitleSizeOrder[0]
        )
      : null;

  return {
    volume:
      volume !== null && Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : null,
    mode,
    autoplay,
    quality,
    subtitleEnabled,
    subtitleSize,
  };
}

export function save(key: Key, value: string | number | boolean) {
  localStorage.setItem(`arc:${key}`, String(value));
}
