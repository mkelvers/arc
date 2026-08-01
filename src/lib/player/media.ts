import type { AudioMode } from '$lib/anime/audio';

export interface Stream {
    url: string;
    quality: string | null;
    audioDelay: number;
    subtitleUrl?: string | null;
    provider?: string;
}

export interface SubtitleCue {
    start: number;
    end: number;
    text: string;
}

export type Sources = Partial<Record<AudioMode, Stream[]>>;
export type SettingsView =
    | 'main'
    | 'audio'
    | 'quality'
    | 'segments'
    | 'segment-opening'
    | 'segment-ending';

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

export function isHlsSource(value: string) {
    try {
        const url = new URL(value, 'http://arc.local');
        const nested = url.searchParams.get('url');
        const source = nested
            ? new URL(nested)
            : url;
        return source.pathname.toLowerCase().endsWith('.m3u8');
    } catch {
        return /\.m3u8(?:$|[?#])/i.test(value);
    }
}

function subtitleTime(value: string) {
    const parts = value.split(':').map(Number);
    if (
        parts.some((part) => !Number.isFinite(part)) ||
        parts.length < 2 ||
        parts.length > 3
    ) {
        return null;
    }

    const seconds = parts.pop()!;
    const minutes = parts.pop()!;
    const hours = parts.pop() ?? 0;
    return hours * 3_600 + minutes * 60 + seconds;
}

function subtitleText(value: string) {
    return value
        .replace(/<[^>]*>/g, '')
        .replace(
            /&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi,
            (entity, decimal, hexadecimal, named) => {
                if (decimal || hexadecimal) {
                    const codePoint = decimal
                        ? Number(decimal)
                        : Number.parseInt(hexadecimal, 16);
                    return Number.isInteger(codePoint) &&
                        codePoint >= 0 &&
                        codePoint <= 0x10ffff &&
                        !(codePoint >= 0xd800 && codePoint <= 0xdfff)
                        ? String.fromCodePoint(codePoint)
                        : entity;
                }
                return subtitleEntities[String(named).toLowerCase()] ?? entity;
            },
        )
        .replaceAll('\\h', '\u00a0')
        .trim();
}

const subtitleEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: '\u00a0',
    quot: '"',
};

export function parseWebVtt(value: string) {
    const blocks = value
        .replace(/^\uFEFF/, '')
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n')
        .split(/\n{2,}/);
    const cues: SubtitleCue[] = [];

    for (const block of blocks) {
        const lines = block.split('\n');
        const timingIndex = lines.findIndex((line) => line.includes('-->'));
        if (timingIndex < 0) {
            continue;
        }

        const timing = lines[timingIndex].match(
            /((?:\d{2,}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{2,}:)?\d{2}:\d{2}\.\d{3})/,
        );
        const start = timing ? subtitleTime(timing[1]) : null;
        const end = timing ? subtitleTime(timing[2]) : null;
        const text = subtitleText(lines.slice(timingIndex + 1).join('\n'));
        if (start === null || end === null || end <= start || !text) {
            continue;
        }

        cues.push({ start, end, text });
    }

    return cues.sort((left, right) => left.start - right.start);
}

export function subtitlesAt(cues: SubtitleCue[], seconds: number) {
    return cues
        .filter((cue) => cue.start <= seconds && seconds < cue.end)
        .map(({ text }) => text);
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
