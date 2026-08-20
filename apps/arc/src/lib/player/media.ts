import { audioModeOrder, type AudioMode } from '$lib/audio';

export interface Stream {
    url: string;
    kind?: 'direct' | 'iframe';
    quality: string | null;
    subtitleUrl?: string | null;
    provider?: string;
}

export interface SubtitleCue {
    start: number;
    end: number;
    text: string;
}

export type Sources = Partial<Record<AudioMode, Stream[]>>;

/** Which audio script the English captions follow. */
export type SubtitleMode = 'off' | 'dub' | 'sub';
export type SubtitleKind = 'cc' | 'translated' | 'limited';

type Shortcut =
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

export interface SubtitleTrack {
    url: string;
    source: Stream;
}

interface SubtitleTracks {
    /** Captions returned with the active encode. */
    own: SubtitleTrack | null;
    /** Captions from the same provider's Japanese encode. */
    sub: SubtitleTrack | null;
}

export function subtitleTracks(
    sources: Sources,
    mode: AudioMode,
    stream: Stream | undefined
): SubtitleTracks {
    if (!stream) {
        return { own: null, sub: null };
    }

    const own = stream.subtitleUrl ? { url: stream.subtitleUrl, source: stream } : null;
    if (mode !== 'dub' || !stream.provider) {
        return { own, sub: null };
    }

    // Prefer the same provider because its subtitle timing is more likely to
    // match the dub. If it has no track, use another provider's Original track
    // rather than leaving the user without subtitles.
    const subSource =
        sources.sub?.find(
            (candidate) => candidate.provider === stream.provider && candidate.subtitleUrl
        ) ?? sources.sub?.find((candidate) => candidate.subtitleUrl);
    const sub = subSource?.subtitleUrl ? { url: subSource.subtitleUrl, source: subSource } : null;

    // MegaPlay sometimes repeats the Japanese VTT in the dub payload. It is
    // still timed for the sub encode, so do not mislabel it as native dub CC.
    const sharedSubTrack = own && sub && own.url === sub.url;

    return {
        own: sharedSubTrack ? null : own,
        sub,
    };
}

export function hasSubtitleTrack(sources: Sources, mode: AudioMode, stream: Stream) {
    const tracks = subtitleTracks(sources, mode, stream);
    return Boolean(tracks.own || tracks.sub);
}

/** Other Japanese encodes whose own captions may prove equivalent to the
 * primary fallback. They are timing references only after cue equality is
 * verified by the player. */
export function subtitleReferenceTracks(sources: Sources, primary: SubtitleTrack) {
    const seen = new Set<string>();

    return (sources.sub ?? []).flatMap((source) => {
        if (!source.subtitleUrl || source === primary.source) {
            return [];
        }

        const key = `${source.url}\n${source.subtitleUrl}`;
        if (seen.has(key)) {
            return [];
        }
        seen.add(key);
        return [{ url: source.subtitleUrl, source }];
    });
}

/** One caption choice in the Subtitles/CC menu. The mode says which loaded
 * cue set to display; the label names the track for the user. None is always
 * offered last. */
export interface SubtitleOption {
    mode: SubtitleMode;
    label: string;
}

/** The subtitle size presets and the pixel size each renders at. */
export const subtitleSizes = {
    small: { label: 'Small', px: 24 },
    normal: { label: 'Normal', px: 32 },
    large: { label: 'Large', px: 40 },
    'extra-large': { label: 'Extra Large', px: 48 },
};

export type SubtitleSize = keyof typeof subtitleSizes;

export const subtitleTextColors = {
    white: { label: 'White', value: '#ffffff' },
    yellow: { label: 'Yellow', value: '#fff36b' },
    black: { label: 'Black', value: '#111111' },
} as const;

export type SubtitleTextColor = keyof typeof subtitleTextColors;

export const subtitleEdgeStyles = {
    outline: { label: 'Outline' },
    none: { label: 'None' },
} as const;

export type SubtitleEdgeStyle = keyof typeof subtitleEdgeStyles;

export const subtitleBackgrounds = {
    black: { label: 'Black', value: '0 0 0' },
    white: { label: 'White', value: '255 255 255' },
    none: { label: 'None', value: null },
} as const;

export type SubtitleBackground = keyof typeof subtitleBackgrounds;

export const subtitleBackgroundOpacities = [0, 0.25, 0.5, 0.75, 1] as const;
export type SubtitleBackgroundOpacity = (typeof subtitleBackgroundOpacities)[number];

/** Menu order for the size presets. */
export const subtitleSizeOrder = [
    'small',
    'normal',
    'large',
    'extra-large',
] as const satisfies readonly SubtitleSize[];

const subtitleLabels = {
    cc: 'English CC',
    translated: 'Original',
    limited: 'Signs & Songs',
} satisfies Record<SubtitleKind, string>;

/** The caption choices for the tracks an encode actually provides. */
export function subtitleOptionsFor(kinds: SubtitleKind[]) {
    const options: SubtitleOption[] = [];
    for (const kind of kinds) {
        options.push({
            mode: kind === 'translated' ? 'sub' : 'dub',
            label: subtitleLabels[kind],
        });
    }
    options.push({ mode: 'off', label: 'None' });
    return options;
}

/** Dub captions are dialogue-capable when their cue coverage is a meaningful
 * fraction of the Japanese track. Full dub CC can combine lines and therefore
 * need not match cue-for-cue; forced/sign tracks are typically far smaller. */
export function hasDialogueCoverage(dubCues: number, subCues: number) {
    const minimumDialogueCues = 50;
    return dubCues >= minimumDialogueCues && (subCues === 0 || dubCues / subCues >= 0.2);
}

/** Cue equality is the proof required before another provider's encode can
 * serve as a timing reference for a fallback track. */
export function sameSubtitleCues(left: SubtitleCue[], right: SubtitleCue[]) {
    return (
        left.length === right.length &&
        left.every(
            (cue, index) =>
                cue.text === right[index].text &&
                Math.abs(cue.start - right[index].start) < 0.01 &&
                Math.abs(cue.end - right[index].end) < 0.01
        )
    );
}

interface HlsTimeline {
    variant: string | null;
    boundaries: number[] | null;
}

/** Read either the first playable variant from a master playlist or the
 * cumulative segment boundaries from a media playlist. */
export function hlsTimeline(value: string): HlsTimeline {
    const lines = value.split(/\r?\n/).map((line) => line.trim());
    const boundaries: number[] = [];
    let elapsed = 0;

    for (const line of lines) {
        const duration = Number(line.match(/^#EXTINF:([\d.]+)/)?.[1]);
        if (!Number.isFinite(duration) || duration <= 0) {
            continue;
        }

        elapsed += duration;
        boundaries.push(elapsed);
    }
    if (boundaries.length) {
        // The final boundary only expresses total duration and is not a
        // content/keyframe anchor shared by the two encodes.
        return { variant: null, boundaries: boundaries.slice(0, -1) };
    }

    const stream = lines.findIndex((line) => line.startsWith('#EXT-X-STREAM-INF:'));
    const variant =
        stream >= 0 ? lines.slice(stream + 1).find((line) => line && !line.startsWith('#')) : null;
    return {
        variant: variant ?? null,
        boundaries: null,
    };
}

function nearestIndex(values: number[], target: number) {
    let low = 0;
    let high = values.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (values[middle] < target) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    return low;
}

const timelineRange = 60;
const timelineStep = 0.25;
const minimumTimelineMatches = 12;

function timelineScore(reference: number[], target: number[], offset: number) {
    const timelineTolerance = 0.25;
    let matches = 0;
    for (const boundary of target) {
        const expected = boundary - offset;
        const index = nearestIndex(reference, expected - timelineTolerance);
        if (index < reference.length && reference[index] <= expected + timelineTolerance) {
            matches++;
        }
    }
    return matches;
}

/** Find one locally stable trim between two HLS timelines. */
function timelineOffset(reference: number[], target: number[]) {
    const minimumTimelineCoverage = 0.15;
    const minimumScoreLead = 1.4;

    if (reference.length < minimumTimelineMatches || target.length < minimumTimelineMatches) {
        return null;
    }

    const candidates: { offset: number; score: number }[] = [];
    for (let offset = -timelineRange; offset <= timelineRange; offset += timelineStep) {
        candidates.push({
            offset,
            score: timelineScore(reference, target, offset),
        });
    }
    candidates.sort((left, right) => right.score - left.score);

    const best = candidates[0];
    const alternate = candidates.find(({ offset }) => Math.abs(offset - best.offset) >= 1);
    const coverage = best.score / Math.min(reference.length, target.length);
    if (
        best.score < minimumTimelineMatches ||
        coverage < minimumTimelineCoverage ||
        (alternate && best.score < alternate.score * minimumScoreLead)
    ) {
        return null;
    }

    const deltas: number[] = [];
    for (const boundary of target) {
        const expected = boundary - best.offset;
        const index = nearestIndex(reference, expected);
        const nearest = [index - 1, index]
            .filter((candidate) => candidate >= 0 && candidate < reference.length)
            .map((candidate) => reference[candidate])
            .toSorted((left, right) => Math.abs(left - expected) - Math.abs(right - expected))[0];
        if (nearest !== undefined && Math.abs(nearest - expected) <= timelineStep * 2) {
            deltas.push(boundary - nearest);
        }
    }
    if (deltas.length < minimumTimelineMatches) {
        return null;
    }

    deltas.sort((left, right) => left - right);
    const offset = deltas[Math.floor(deltas.length / 2)];
    return Math.abs(offset) < 0.05 ? 0 : offset;
}

interface TimelineOffset {
    /** Time on the reference encode at which this offset starts. */
    at: number;
    /** Seconds added to reference-timed cues on the target encode. */
    offset: number;
}

function median(values: number[]) {
    const ordered = values.toSorted((left, right) => left - right);
    return ordered[Math.floor(ordered.length / 2)];
}

/** Align HLS encodes as piecewise-constant trims. Dub releases can insert
 * distributor cards, alternate openings, or eyecatches, so one offset for the
 * whole episode is not always valid. Weak local correlations are omitted. */
export function hlsTimelineOffsets(reference: number[], target: number[]): TimelineOffset[] {
    const alignmentWindow = 120;
    const alignmentStep = 20;
    const alignmentChangeTolerance = 0.5;
    const minimumAlignmentSamples = 2;
    const end = reference.at(-1) ?? 0;
    const samples: TimelineOffset[] = [];

    for (let start = 0; start < end; start += alignmentStep) {
        const stop = start + alignmentWindow;
        const offset = timelineOffset(
            reference.filter((boundary) => boundary >= start && boundary <= stop),
            target.filter(
                (boundary) =>
                    boundary >= Math.max(0, start - timelineRange) &&
                    boundary <= stop + timelineRange
            )
        );
        if (offset !== null) {
            samples.push({
                at: start + alignmentWindow / 2,
                offset,
            });
        }
    }

    const groups: TimelineOffset[][] = [];
    for (const sample of samples) {
        const group = groups.at(-1);
        const groupOffset = group ? median(group.map(({ offset }) => offset)) : null;
        if (
            !group ||
            groupOffset === null ||
            Math.abs(sample.offset - groupOffset) >= alignmentChangeTolerance
        ) {
            groups.push([sample]);
        } else {
            group.push(sample);
        }
    }

    const stable = groups.filter((group) => group.length >= minimumAlignmentSamples);
    if (!stable.length) {
        const sampleEnd = Math.min(end, 300);
        const offset = timelineOffset(
            reference.filter((boundary) => boundary <= sampleEnd),
            target.filter((boundary) => boundary <= sampleEnd + timelineRange)
        );
        return offset === null ? [] : [{ at: 0, offset }];
    }

    return stable.map((group, index) => {
        const previous = stable[index - 1];
        const previousEnd = previous?.at(-1)?.at;
        return {
            at: previousEnd === undefined ? 0 : (previousEnd + group[0].at) / 2,
            offset: median(group.map((sample) => sample.offset)),
        };
    });
}

export function alignSubtitleCues(cues: SubtitleCue[], offsets: TimelineOffset[]) {
    if (!offsets.length) {
        return cues;
    }

    return cues.map((cue) => {
        const offset = offsets.findLast(({ at }) => at <= cue.start)?.offset;
        return offset === undefined
            ? cue
            : {
                  ...cue,
                  start: cue.start + offset,
                  end: cue.end + offset,
              };
    });
}

export function orderStreams(streams: Stream[], quality: string) {
    if (quality === 'best') {
        const hls = streams.filter((stream) => isHlsSource(stream.url));
        return hls.length
            ? [...hls, ...streams.filter((stream) => !hls.includes(stream))]
            : streams;
    }

    const selected = streams.find((stream) => stream.quality === quality);
    if (!selected) {
        return streams;
    }

    return [selected, ...streams.filter((stream) => stream !== selected)];
}

export function seekTarget(currentTime: number, delta: number, duration: number) {
    if (!Number.isFinite(duration)) {
        return currentTime;
    }

    return Math.max(0, Math.min(duration, currentTime + delta));
}

export function availableModes(sources: Sources) {
    return audioModeOrder.filter((mode) => Boolean(sources[mode]?.length));
}

export function audioLabel(mode: AudioMode) {
    if (mode === 'dub') {
        return 'English';
    }

    return mode === 'raw' ? 'Japanese (Raw)' : 'Japanese';
}

export function isHd(quality: string | null) {
    return Number(quality?.match(/\d+/)?.[0] ?? 0) >= 720;
}

export function isHlsSource(value: string) {
    try {
        const url = new URL(value, 'http://arc.local');
        const nested = url.searchParams.get('url');
        const source = nested ? new URL(nested) : url;
        return source.pathname.toLowerCase().endsWith('.m3u8');
    } catch {
        return /\.m3u8(?:$|[?#])/i.test(value);
    }
}

function subtitleTime(value: string) {
    const parts = value.split(':').map(Number);
    if (parts.some((part) => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) {
        return null;
    }

    const seconds = parts.pop();
    const minutes = parts.pop();
    if (seconds === undefined || minutes === undefined) {
        return null;
    }

    const hours = parts.pop() ?? 0;
    return hours * 3_600 + minutes * 60 + seconds;
}

function subtitleText(value: string) {
    return value
        .replace(/<[^>]*>/g, '')
        .replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (entity, decimal, hexadecimal, named) => {
            if (decimal || hexadecimal) {
                const codePoint = decimal ? Number(decimal) : Number.parseInt(hexadecimal, 16);
                return Number.isInteger(codePoint) &&
                    codePoint >= 0 &&
                    codePoint <= 0x10ffff &&
                    !(codePoint >= 0xd800 && codePoint <= 0xdfff)
                    ? String.fromCodePoint(codePoint)
                    : entity;
            }
            return subtitleEntities.get(String(named).toLowerCase()) ?? entity;
        })
        .replaceAll('\\h', '\u00a0')
        .trim();
}

const subtitleEntities = new Map([
    ['amp', '&'],
    ['apos', "'"],
    ['gt', '>'],
    ['lt', '<'],
    ['nbsp', '\u00a0'],
    ['quot', '"'],
]);

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
            /((?:\d{2,}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{2,}:)?\d{2}:\d{2}\.\d{3})/
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
    return cues.filter((cue) => cue.start <= seconds && seconds < cue.end).map(({ text }) => text);
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
        Boolean(target.closest('button, input, select, textarea, a, [role="menu"]'))
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
