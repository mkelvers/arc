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

const storageKey = 'arc:preferences';
const preferenceKeys: readonly Key[] = [
    'audio-mode',
    'autoplay',
    'quality',
    'volume',
    'subtitles',
    'subtitle-mode',
    'subtitle-size',
    'subtitle-text-color',
    'subtitle-background',
    'subtitle-background-opacity',
    'subtitle-edge-style',
];

function readValues() {
    const values: Record<string, string> = {};
    const stored = localStorage.getItem(storageKey);
    let validStored = stored === null;
    if (stored !== null) {
        try {
            const parsed: unknown = JSON.parse(stored);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                validStored = true;
                for (const [key, value] of Object.entries(parsed)) {
                    if (typeof value === 'string') {
                        values[key] = value;
                    }
                }
            }
        } catch {
            // Ignore malformed preference data and use defaults below.
        }
    }

    let migrated = false;
    for (const key of preferenceKeys) {
        const legacyValue = localStorage.getItem(`arc:${key}`);
        if (!(key in values) && legacyValue !== null) {
            values[key] = legacyValue;
            migrated = true;
        }
        if (legacyValue !== null) {
            localStorage.removeItem(`arc:${key}`);
            migrated = true;
        }
    }

    if (migrated || !validStored) {
        localStorage.setItem(storageKey, JSON.stringify(values));
    }

    return values;
}

export function load(sources: Sources, qualities: string[]) {
    const values = readValues();
    const rawVolume = values.volume ?? null;
    const volume = rawVolume === null ? null : Number(rawVolume);
    const rawMode = values['audio-mode'] ?? null;
    const mode: AudioMode | null =
        (rawMode === 'sub' || rawMode === 'dub' || rawMode === 'raw') && sources[rawMode]?.length
            ? rawMode
            : null;
    const rawAutoplay = values.autoplay ?? null;
    const autoplay =
        rawAutoplay === 'true' || rawAutoplay === 'false' ? rawAutoplay === 'true' : null;
    const rawQuality = values.quality ?? null;
    const quality =
        rawQuality === 'best' ||
        qualities.includes(rawQuality ?? '') ||
        /^\d+p$/.test(rawQuality ?? '')
            ? (rawQuality ?? 'best')
            : null;
    const rawSubtitles = values.subtitles ?? null;
    const rawSubtitleMode = values['subtitle-mode'] ?? null;
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
    const rawSize = values['subtitle-size'] ?? null;
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

    const rawTextColor = values['subtitle-text-color'] ?? null;
    const subtitleTextColor: SubtitleTextColor | null =
        rawTextColor !== null && rawTextColor in subtitleTextColors
            ? (rawTextColor as SubtitleTextColor)
            : null;
    const rawBackground = values['subtitle-background'] ?? null;
    const subtitleBackground: SubtitleBackground | null =
        rawBackground !== null && rawBackground in subtitleBackgrounds
            ? (rawBackground as SubtitleBackground)
            : null;
    const rawBackgroundOpacity = Number(values['subtitle-background-opacity']);
    const subtitleBackgroundOpacity: SubtitleBackgroundOpacity | null =
        subtitleBackgroundOpacities.includes(rawBackgroundOpacity as SubtitleBackgroundOpacity)
            ? (rawBackgroundOpacity as SubtitleBackgroundOpacity)
            : null;
    const rawEdgeStyle = values['subtitle-edge-style'] ?? null;
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
    const values = readValues();
    values[key] = String(value);
    localStorage.setItem(storageKey, JSON.stringify(values));
}
