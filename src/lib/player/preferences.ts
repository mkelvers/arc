import type { AudioMode } from '$lib/anime/audio';
import {
    isSubtitleSize,
    subtitleBackgroundOpacities,
    subtitleBackgrounds,
    subtitleSizeOrder,
    subtitleSizes,
    subtitleTextColors,
    type Sources,
    type SubtitleBackground,
    type SubtitleBackgroundOpacity,
    type SubtitleEdgeStyle,
    type SubtitleSize,
    type SubtitleMode,
    type SubtitleTextColor,
} from './media';

type Key =
    | 'audio-mode'
    | 'autoplay'
    | 'quality'
    | 'volume'
    | 'subtitles'
    | 'subtitle-mode'
    | 'subtitle-size'
    | 'subtitle-text-color'
    | 'subtitle-background'
    | 'subtitle-background-opacity'
    | 'subtitle-edge-style';

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
        rawQuality === 'best' ||
        qualities.includes(rawQuality ?? '') ||
        /^\d+p$/.test(rawQuality ?? '')
            ? (rawQuality ?? 'best')
            : null;
    const rawSubtitles = localStorage.getItem('arc:subtitles');
    const rawSubtitleMode = localStorage.getItem('arc:subtitle-mode');
    const subtitleMode: SubtitleMode | null =
        rawSubtitleMode === 'off' || rawSubtitleMode === 'dub' || rawSubtitleMode === 'sub'
            ? rawSubtitleMode
            : null;
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

    const rawTextColor = localStorage.getItem('arc:subtitle-text-color');
    const subtitleTextColor: SubtitleTextColor | null =
        rawTextColor !== null && rawTextColor in subtitleTextColors
            ? (rawTextColor as SubtitleTextColor)
            : null;
    const rawBackground = localStorage.getItem('arc:subtitle-background');
    const subtitleBackground: SubtitleBackground | null =
        rawBackground !== null && rawBackground in subtitleBackgrounds
            ? (rawBackground as SubtitleBackground)
            : null;
    const rawBackgroundOpacity = Number(localStorage.getItem('arc:subtitle-background-opacity'));
    const subtitleBackgroundOpacity: SubtitleBackgroundOpacity | null =
        subtitleBackgroundOpacities.includes(rawBackgroundOpacity as SubtitleBackgroundOpacity)
            ? (rawBackgroundOpacity as SubtitleBackgroundOpacity)
            : null;
    const rawEdgeStyle = localStorage.getItem('arc:subtitle-edge-style');
    const subtitleEdgeStyle: SubtitleEdgeStyle | null =
        rawEdgeStyle === 'outline' || rawEdgeStyle === 'none' ? rawEdgeStyle : null;

    return {
        volume:
            volume !== null && Number.isFinite(volume) && volume >= 0 && volume <= 1
                ? volume
                : null,
        mode,
        autoplay,
        quality,
        subtitleEnabled,
        subtitleMode,
        subtitleSize,
        subtitleTextColor,
        subtitleBackground,
        subtitleBackgroundOpacity,
        subtitleEdgeStyle,
    };
}

export function save(key: Key, value: string | number | boolean) {
    localStorage.setItem(`arc:${key}`, String(value));
}
