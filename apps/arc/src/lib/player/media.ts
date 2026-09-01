import { audioModeOrder, type AudioMode } from '@arc/shared/audio';
import type { EpisodeSkipTimes } from '@arc/shared/player/skip-times';

export type {
    SubtitleBackground,
    SubtitleBackgroundOpacity,
    SubtitleEdgeStyle,
    SubtitleSize,
    SubtitleTextColor,
} from './subtitle-settings';

export interface Stream {
    provider: string;
    server: string;
    url: string;
    quality: string | null;
    subtitles: Array<{
        kind: 'full' | 'sdh' | 'forced';
        url: string;
    }>;
}

export interface SubtitleCue {
    start: number;
    end: number;
    text: string;
}

export type Sources = Partial<Record<AudioMode, Stream[]>>;

/** Which English caption variant is displayed. */
export type SubtitleMode = 'off' | 'full' | 'sdh' | 'forced' | 'translated';
export type SubtitleKind = Exclude<SubtitleMode, 'off'>;

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
    return sources[mode] ?? [];
}

export interface SubtitleTrack {
    url: string;
    kind: SubtitleKind;
    source: Stream;
}

interface SubtitleTracks {
    /** Captions returned with the active encode. */
    own: SubtitleTrack[];
    /** One translated fallback from the same provider's Japanese encode. */
    sub: SubtitleTrack | null;
}

export function subtitleTracks(
    sources: Sources,
    mode: AudioMode,
    stream: Stream | undefined
): SubtitleTracks {
    if (!stream) {
        return { own: [], sub: null };
    }

    const own = stream.subtitles.map((subtitle) => ({ ...subtitle, source: stream }));
    if (mode !== 'dub' || own.length > 0) {
        return { own, sub: null };
    }

    // Use the same provider's sub encode only when the dub has no native
    // English track. The provider/server remain attached for alignment and
    // provenance; another provider is never borrowed.
    const subSource =
        sources.sub
            ?.filter(
                (candidate) =>
                    candidate.provider === stream.provider && candidate.subtitles.length > 0
            )
            .toSorted(
                (left, right) =>
                    Number(right.server === stream.server) - Number(left.server === stream.server)
            )[0] ?? null;
    const subtitle = subSource?.subtitles[0];
    return {
        own,
        sub: subtitle
            ? {
                  ...subtitle,
                  kind: 'translated',
                  source: subSource,
              }
            : null,
    };
}

export function hasSubtitleTrack(sources: Sources, mode: AudioMode, stream: Stream) {
    const tracks = subtitleTracks(sources, mode, stream);
    return tracks.own.length > 0 || tracks.sub !== null;
}

/** Other same-provider encodes whose own captions may prove equivalent to the
 * primary fallback. They are timing references only after cue equality is
 * verified by the player. */
export function subtitleReferenceTracks(sources: Sources, primary: SubtitleTrack) {
    const seen = new Set<string>();

    return (sources.sub ?? []).flatMap((source) => {
        if (source.provider !== primary.source.provider || source === primary.source) {
            return [];
        }

        return source.subtitles.flatMap((subtitle) => {
            const key = `${source.url}\n${subtitle.url}`;
            if (seen.has(key)) {
                return [];
            }
            seen.add(key);
            return [{ ...subtitle, source }];
        });
    });
}

/** One caption choice in the Subtitles/CC menu. The mode says which loaded
 * cue set to display; the label names the track for the user. Off is always
 * offered last. */
export interface SubtitleOption {
    mode: SubtitleMode;
    label: string;
}

const subtitleLabels = {
    full: 'English',
    sdh: 'English SDH',
    forced: 'English Forced',
    translated: 'Original translation',
} satisfies Record<SubtitleKind, string>;

/** The caption choices for the tracks an encode actually provides. */
export function subtitleOptionsFor(kinds: SubtitleKind[]) {
    const options: SubtitleOption[] = [];
    for (const kind of ['full', 'sdh', 'forced', 'translated'] as const) {
        if (!kinds.includes(kind)) {
            continue;
        }
        options.push({
            mode: kind,
            label: subtitleLabels[kind],
        });
    }
    options.push({ mode: 'off', label: 'Off' });
    return options;
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

export interface TimelineOffset {
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

export function alignSkipTimes(
    times: EpisodeSkipTimes,
    offsets: TimelineOffset[]
): EpisodeSkipTimes {
    if (!offsets.length) {
        return times;
    }

    const align = (value: number) => {
        const offset = offsets.findLast(({ at }) => at <= value)?.offset;
        return offset === undefined ? value : value + offset;
    };

    return {
        ...times,
        opening: times.opening
            ? {
                  start: align(times.opening.start),
                  end: align(times.opening.end),
              }
            : null,
        ending: times.ending
            ? {
                  start: align(times.ending.start),
                  end: align(times.ending.end),
              }
            : null,
    };
}

export function unalignTime(value: number, offsets: TimelineOffset[]) {
    let reference = value;
    for (let iteration = 0; iteration < 3; iteration += 1) {
        const offset = offsets.findLast(({ at }) => at <= reference)?.offset ?? 0;
        reference = value - offset;
    }
    return reference;
}

export async function fetchHlsTimeline(source: string, signal: AbortSignal) {
    if (!isHlsSource(source)) {
        return null;
    }

    const response = await fetch(source, { signal });
    if (!response.ok) {
        return null;
    }

    let timeline = hlsTimeline(await response.text());
    if (!timeline.variant) {
        return timeline.boundaries;
    }

    const base = response.url || new URL(source, location.href).toString();
    const variant = await fetch(new URL(timeline.variant, base), { signal });
    if (!variant.ok) {
        return null;
    }

    timeline = hlsTimeline(await variant.text());
    return timeline.boundaries;
}

export function orderStreams(streams: Stream[], quality: string) {
    if (quality === 'best') {
        const hls = streams.filter((stream) => isHlsSource(stream.url));
        return hls.length
            ? [...hls, ...streams.filter((stream) => !hls.includes(stream))]
            : streams;
    }

    const selected = streams.find((stream) => stream.quality === quality);
    if (selected) {
        return [selected, ...streams.filter((stream) => stream !== selected)];
    }

    const requestedHeight = Number.parseInt(quality);
    if (!Number.isFinite(requestedHeight)) {
        return streams;
    }

    const fallback = streams
        .filter((stream) => {
            const height = Number.parseInt(stream.quality ?? '');
            return Number.isFinite(height) && height <= requestedHeight;
        })
        .toSorted(
            (left, right) =>
                Number.parseInt(right.quality ?? '') - Number.parseInt(left.quality ?? '')
        )[0];
    const adaptive = streams.find((stream) => isHlsSource(stream.url));
    const preferred = adaptive ?? fallback;

    return preferred ? [preferred, ...streams.filter((stream) => stream !== preferred)] : streams;
}

export function seekTarget(currentTime: number, delta: number, duration: number) {
    if (!Number.isFinite(duration)) {
        return currentTime;
    }

    return Math.max(0, Math.min(duration, currentTime + delta));
}

export function playbackStartTarget(
    startAt: number,
    resumeAt: number | null,
    autoplayAttempted: boolean
) {
    const savedStart =
        !autoplayAttempted && Number.isFinite(startAt) && startAt > 0 ? startAt : null;

    if (resumeAt === null || savedStart === null) {
        return resumeAt ?? savedStart;
    }

    return Math.max(resumeAt, savedStart);
}

export function availableModes(sources: Sources) {
    return audioModeOrder.filter((mode) => (sources[mode]?.length ?? 0) > 0);
}

export function isHd(quality: string | null) {
    return Number(quality?.match(/\d+/)?.[0] ?? 0) >= 720;
}

function hasHlsPath(value: string) {
    try {
        return new URL(value, 'http://arc.local').pathname.toLowerCase().endsWith('.m3u8');
    } catch {
        return /\.m3u8(?:$|[?#])/i.test(value);
    }
}

function decodeBase64Url(value: string) {
    try {
        const binary = atob(
            value.replaceAll('-', '+').replaceAll('_', '/') +
                '='.repeat((4 - (value.length % 4)) % 4)
        );
        return new TextDecoder().decode(
            Uint8Array.from(binary, (character) => character.charCodeAt(0))
        );
    } catch {
        return null;
    }
}

export function isHlsSource(value: string) {
    if (hasHlsPath(value)) {
        return true;
    }

    try {
        const encodedSource = new URL(value, 'http://arc.local').searchParams.get('src');
        const source = encodedSource ? decodeBase64Url(encodedSource) : null;
        return source ? hasHlsPath(source) : false;
    } catch {
        return false;
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
        target.closest('button, input, select, textarea, a, [role="menu"]') !== null
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
