import type { AudioMode } from '$lib/anime/audio';

export interface Stream {
    url: string;
    quality: string | null;
    audioDelay: number;
}

export type Sources = Partial<Record<AudioMode, Stream[]>>;
export type SettingsView = 'main' | 'audio' | 'quality';

export type Shortcut =
    | 'play'
    | 'mute'
    | 'fullscreen'
    | 'start'
    | 'end'
    | { seek: number }
    | { volume: number }
    | { percent: number };

export function streamsFor(sources: Sources, mode: AudioMode) {
    return sources[mode] ?? sources.sub ?? sources.dub ?? sources.raw ?? [];
}

export function qualitiesFor(streams: Stream[]) {
    return streams
        .map(({ quality }) => quality)
        .filter(
            (value, index, values): value is string =>
                Boolean(value) && values.indexOf(value) === index,
        );
}

export function orderStreams(streams: Stream[], quality: string) {
    if (quality === 'best') {
        return streams;
    }

    const selected = streams.find((stream) => stream.quality === quality);
    if (!selected) {
        return streams;
    }

    return [selected, ...streams.filter((stream) => stream !== selected)];
}

export function availableModes(sources: Sources) {
    return (['sub', 'dub', 'raw'] as const).filter((mode) =>
        Boolean(sources[mode]?.length),
    );
}

export function hasStreams(sources: Sources) {
    return availableModes(sources).length > 0;
}

export function audioLabel(mode: AudioMode) {
    if (mode === 'dub') {
        return 'English';
    }

    return mode === 'raw' ? 'Japanese (Raw)' : 'Japanese';
}

export function qualityLabel(quality: string, best: string | null) {
    if (quality !== 'best') {
        return quality;
    }

    return best ? `Auto ${best}` : 'Auto';
}

export function isHd(quality: string | null) {
    return Number(quality?.match(/\d+/)?.[0] ?? 0) >= 720;
}

export function formatTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '0:00';
    }

    const hours = Math.floor(seconds / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);

    if (hours) {
        return minutes ? `${hours}h, ${minutes}m` : `${hours}h`;
    }

    const remainder = Math.floor(seconds % 60)
        .toString()
        .padStart(2, '0');

    return `${minutes}:${remainder}`;
}

export function isControl(target: EventTarget | null) {
    return (
        target instanceof Element &&
        Boolean(
            target.closest(
                'button, input, select, textarea, a, [role="menu"]',
            ),
        )
    );
}

export function shortcut(event: KeyboardEvent): Shortcut | null {
    const target = event.target;
    const editing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement ||
        (target instanceof HTMLElement && target.isContentEditable);

    if (editing || event.metaKey || event.ctrlKey || event.altKey) {
        return null;
    }

    const digit = /^(?:Digit|Numpad)(\d)$/.exec(event.code);
    if (digit) {
        return { percent: Number(digit[1]) / 10 };
    }

    switch (event.code) {
        case 'Space':
        case 'KeyK':
            return 'play';
        case 'ArrowLeft':
        case 'KeyJ':
            return { seek: -10 };
        case 'ArrowRight':
        case 'KeyL':
            return { seek: 10 };
        case 'Home':
            return 'start';
        case 'End':
            return 'end';
        case 'ArrowUp':
            return { volume: 0.05 };
        case 'ArrowDown':
            return { volume: -0.05 };
        case 'KeyM':
            return 'mute';
        case 'KeyF':
            return 'fullscreen';
        default:
            return null;
    }
}
