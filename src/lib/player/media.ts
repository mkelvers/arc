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
    | 'subtitles'
    | 'subtitle-language'
    | 'subtitle-size'
    | 'subtitle-background'
    | 'quality'
    | 'segments'
    | 'segment-opening'
    | 'segment-ending';

/** Which caption track(s) to show: the active stream's own, the sub
 * track, or both merged with the active stream's track preferred. */
export type SubtitleMode = 'merge' | 'dub' | 'sub';

export type SubtitleSize =
    | 'small'
    | 'normal'
    | 'large'
    | 'extra-large';

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

export interface SubtitleTracks {
    /** The active stream's own caption track, if it has one. */
    own: string | null;
    /** The sub version's caption track, as a fallback for dubs. */
    sub: string | null;
}

export function subtitleTracks(
    sources: Sources,
    stream: Stream | undefined,
): SubtitleTracks {
    return {
        own: stream?.subtitleUrl ?? null,
        sub: sources.sub?.find((candidate) => candidate.subtitleUrl)
            ?.subtitleUrl ?? null,
    };
}

// Provider dub tracks and sub tracks overlap: the same dialogue often appears
// in both, at roughly the same time but with different wording (dubs add
// speaker labels, SDH sound effects, and their own translations). When both
// say the same line, keep only the preferred (dub) track; otherwise show both.
const minimumSharedLineRatio = 0.4;

function lineWords(value: string) {
    return value
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .split(/[^\p{L}\p{N}']+/u)
        .filter(Boolean);
}

function containedWords(shorter: string[], longer: string[]) {
    let cursor = 0;
    for (const word of shorter) {
        cursor = longer.indexOf(word, cursor) + 1;
        if (!cursor) {
            return false;
        }
    }
    return true;
}

export function sameLine(left: string, right: string) {
    const a = lineWords(left);
    const b = lineWords(right);
    if (a.join(' ') === b.join(' ')) {
        return true;
    }

    // Treat a line as the same when one is a fuller version of the other
    // (speaker prefixes, extra words, punctuation, line breaks) and the shared
    // core is a substantial part of the longer line. A short phrase inside a
    // longer, different line ("How?" in "How did this happen?") does not
    // count, and word order still matters: "I hate you" and "You hate me"
    // are different lines.
    const [shorter, longer] =
        a.length <= b.length ? [a, b] : [b, a];
    return (
        containedWords(shorter, longer) &&
        shorter.length / longer.length >= minimumSharedLineRatio
    );
}

function overlaps(left: SubtitleCue, right: SubtitleCue) {
    return left.start < right.end && right.start < left.end;
}

// Dub and sub versions of an episode are separate encodes whose audio can
// be heard offset from the shared video timeline (dubs usually run early;
// measured trims are around 11 seconds). The dub's own captions are anchored
// to that dub timeline; the sub track is not. When enough lines appear in
// both, shift the sub cues onto the dub timeline so merged or sub-only
// captions stay in sync with the heard audio. The window is wide enough to
// see those trims but stays far below title cards that coincidentally share
// wording at unrelated times (existing test gap: 100 seconds).
const subtitleCalibrationWindow = 15;
const minimumCalibrationMatches = 3;
// Same-wording matches only earn the median when they cluster tightly around
// it: short phrases that coincidentally appear in differently worded tracks
// (AI-translated dubs) spread out and would otherwise corrupt the offset.
const calibrationTightWindow = 1;
const calibrationTightRatio = 0.6;

/** The median offset (in seconds) of the lines the alternate track shares
 * with the preferred track, or null when too few lines match to trust it.
 * Positive means the alternate runs early relative to the preferred: adding
 * the offset moves its cues onto the preferred timeline. */
export function subtitleTrackOffset(
    preferred: SubtitleCue[],
    alternate: SubtitleCue[],
) {
    const deltas: number[] = [];
    let from = 0;

    for (const cue of preferred) {
        while (
            from < alternate.length &&
            alternate[from].end < cue.start - subtitleCalibrationWindow
        ) {
            from++;
        }

        for (let index = from; index < alternate.length; index++) {
            const other = alternate[index];
            if (other.start > cue.start + subtitleCalibrationWindow) {
                break;
            }
            if (
                sameLine(cue.text, other.text) &&
                Math.abs(cue.start - other.start) <=
                    subtitleCalibrationWindow
            ) {
                deltas.push(cue.start - other.start);
                break;
            }
        }
    }

    if (deltas.length < minimumCalibrationMatches) {
        return null;
    }

    deltas.sort((left, right) => left - right);
    const median = deltas[Math.floor(deltas.length / 2)];
    const tight =
        deltas.filter(
            (delta) => Math.abs(delta - median) <= calibrationTightWindow,
        ).length / deltas.length;

    return tight >= calibrationTightRatio ? median : null;
}

// Same-wording calibration cannot see tracks whose text was translated or
// rewritten (AI-generated dub captions), but those tracks still place cues at
// the same moments as the dialogue they cover. When same-line matching fails,
// correlate cue timing density instead of wording.
const patternBin = 0.5; // coarse shift step, seconds
const patternRange = 60; // maximum plausible trim between encodes, seconds
const patternCoincidence = 0.25; // midpoint match window, seconds
const minimumPatternCues = 10; // below this, timing density is meaningless
const patternRefineDistance = 2; // nearest-cue window when refining, seconds
const patternCandidateSpread = 5; // skip candidates this close to a tried one

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

/** The timing offset between two differently worded tracks, found by
 * correlating when dialogue happens rather than what it says. Returns null
 * when either track is too sparse or no candidate shift is consistent. */
export function subtitlePatternOffset(
    preferred: SubtitleCue[],
    alternate: SubtitleCue[],
) {
    if (
        preferred.length < minimumPatternCues ||
        alternate.length < minimumPatternCues
    ) {
        return null;
    }

    const preferredMids = preferred
        .map((cue) => (cue.start + cue.end) / 2)
        .sort((left, right) => left - right);
    const alternateMids = alternate
        .map((cue) => (cue.start + cue.end) / 2)
        .sort((left, right) => left - right);
    const alternateStarts = alternate
        .map((cue) => cue.start)
        .sort((left, right) => left - right);

    const candidates: { shift: number; score: number }[] = [];
    for (
        let shift = -patternRange;
        shift <= patternRange;
        shift += patternBin
    ) {
        let score = 0;
        for (const mid of preferredMids) {
            const target = mid - shift;
            const index = nearestIndex(
                alternateMids,
                target - patternCoincidence,
            );
            if (
                index < alternateMids.length &&
                alternateMids[index] <= target + patternCoincidence
            ) {
                score++;
            }
        }
        candidates.push({ shift, score });
    }
    candidates.sort((left, right) => right.score - left.score);

    const tried: number[] = [];
    for (const { shift } of candidates) {
        if (
            tried.some(
                (value) => Math.abs(value - shift) <= patternCandidateSpread,
            )
        ) {
            continue;
        }
        tried.push(shift);

        // Refine the coarse candidate against nearest cue starts; a candidate
        // wins when at least the dimension minimum of cues line up and the
        // deltas cluster tightly around their median.
        const deltas: number[] = [];
        for (const cue of preferred) {
            const target = cue.start - shift;
            const index = nearestIndex(alternateStarts, target);
            let nearest: { start: number; distance: number } | null = null;
            for (const candidate of [index - 1, index]) {
                if (candidate < 0 || candidate >= alternateStarts.length) {
                    continue;
                }
                const distance = Math.abs(
                    alternateStarts[candidate] - target,
                );
                if (
                    nearest === null ||
                    distance < nearest.distance
                ) {
                    nearest = {
                        start: alternateStarts[candidate],
                        distance,
                    };
                }
            }
            if (nearest && nearest.distance <= patternRefineDistance) {
                deltas.push(cue.start - nearest.start);
            }
        }

        if (deltas.length < minimumPatternCues) {
            continue;
        }
        deltas.sort((left, right) => left - right);
        const median = deltas[Math.floor(deltas.length / 2)];
        const tight =
            deltas.filter(
                (delta) => Math.abs(delta - median) <= calibrationTightWindow,
            ).length / deltas.length;
        if (tight >= calibrationTightRatio) {
            return median;
        }
    }

    return null;
}

/** Shift the alternate (sub) track onto the preferred (dub) track's
 * timeline, or return it unchanged when the tracks already line up or share
 * too few matching cues to calibrate. Same-wording lines are matched first;
 * when they cannot be trusted, cue timing patterns take over. */
export function alignSubtitleTracks(
    preferred: SubtitleCue[],
    alternate: SubtitleCue[],
) {
    const offset =
        subtitleTrackOffset(preferred, alternate) ??
        subtitlePatternOffset(preferred, alternate);
    if (!offset) {
        return alternate;
    }

    return alternate.map((cue) => ({
        start: cue.start + offset,
        end: cue.end + offset,
        text: cue.text,
    }));
}

export function mergeSubtitleTracks(
    preferred: SubtitleCue[],
    alternate: SubtitleCue[],
) {
    const merged = [...preferred];

    for (const cue of alternate) {
        const redundant = preferred.some(
            (other) => overlaps(other, cue) && sameLine(other.text, cue.text),
        );
        if (!redundant) {
            merged.push(cue);
        }
    }

    return merged.sort((left, right) => left.start - right.start);
}

export function subtitlesFor(
    mode: SubtitleMode,
    own: SubtitleCue[] | null,
    sub: SubtitleCue[] | null,
) {
    if (mode === 'dub') {
        return own ?? sub;
    }
    if (mode === 'sub') {
        return sub ?? own;
    }
    return own && sub
        ? mergeSubtitleTracks(own, sub)
        : (own ?? sub);
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
