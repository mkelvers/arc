import type { AudioMode } from '@arc/core/client';
import {
    alignSubtitleCues,
    fetchHlsTimeline,
    hlsTimelineOffsets,
    parseWebVtt,
    sameSubtitleCues,
    subtitleOptionsFor,
    subtitleReferenceTracks,
    subtitleTracks,
    type Sources,
    type Stream,
    type SubtitleBackground,
    type SubtitleBackgroundOpacity,
    type SubtitleCue,
    type SubtitleEdgeStyle,
    type SubtitleKind,
    type SubtitleMode,
    type SubtitleOption,
    type SubtitleSize,
    type SubtitleTextColor,
    type SubtitleTrack,
} from './media';
import * as preferences from './preferences';

export class Captions {
    cues = $state<SubtitleCue[]>([]);
    mode = $state<SubtitleMode>('off');
    options = $state<SubtitleOption[]>(subtitleOptionsFor([]));
    size = $state<SubtitleSize>('normal');
    textColor = $state<SubtitleTextColor>('white');
    background = $state<SubtitleBackground>('black');
    backgroundOpacity = $state<SubtitleBackgroundOpacity>(0.75);
    edgeStyle = $state<SubtitleEdgeStyle>('outline');
    enabled = true;

    private request: AbortController | null = null;
    private source = '';
    private loaded: Partial<Record<Exclude<SubtitleMode, 'off'>, SubtitleCue[]>> = {};

    clear() {
        this.request?.abort();
        this.request = null;
        this.source = '';
        this.cues = [];
        this.mode = 'off';
        this.loaded = {};
        this.options = subtitleOptionsFor([]);
    }

    switchSize(size: SubtitleSize) {
        if (size === this.size) {
            return;
        }

        this.size = size;
        preferences.save('subtitle-size', size);
    }

    select(mode: SubtitleMode): 'done' | 'load-current' | 'reevaluate-source' {
        const enabled = mode !== 'off';
        if (enabled === this.enabled && mode === this.mode) {
            return 'done';
        }

        const wasEnabled = this.enabled;
        this.enabled = enabled;
        this.mode = mode;
        preferences.save('subtitles', enabled);
        preferences.save('subtitle-mode', mode);

        if (mode === 'off') {
            this.cues = [];
            return 'done';
        }

        const loaded = this.loaded[mode];
        if (loaded) {
            this.cues = loaded;
            return 'done';
        }

        return wasEnabled ? 'load-current' : 'reevaluate-source';
    }

    private async fetchCues(url: string, signal: AbortSignal) {
        try {
            const response = await fetch(url, {
                signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
            });
            if (!response.ok) {
                return null;
            }

            const cues = parseWebVtt(await response.text());
            return cues.length ? cues : null;
        } catch {
            return null;
        }
    }

    private async offsets(reference: Stream, target: Stream, signal: AbortSignal) {
        if (reference.url === target.url) {
            return [{ at: 0, offset: 0 }];
        }

        const [referenceTimeline, targetTimeline] = await Promise.all([
            fetchHlsTimeline(reference.url, signal),
            fetchHlsTimeline(target.url, signal),
        ]);
        return referenceTimeline && targetTimeline
            ? hlsTimelineOffsets(referenceTimeline, targetTimeline)
            : null;
    }

    private async fallbackOffsets(
        sources: Sources,
        primary: SubtitleTrack,
        target: Stream,
        cues: SubtitleCue[],
        signal: AbortSignal
    ) {
        const offsets = await this.offsets(primary.source, target, signal);
        if (offsets?.length) {
            return offsets;
        }

        const loaded = new Map<string, SubtitleCue[] | null>([[primary.url, cues]]);
        for (const reference of subtitleReferenceTracks(sources, primary)) {
            let referenceCues = loaded.get(reference.url);
            if (referenceCues === undefined) {
                referenceCues = await this.fetchCues(reference.url, signal);
                loaded.set(reference.url, referenceCues);
            }
            if (!referenceCues || !sameSubtitleCues(cues, referenceCues)) {
                continue;
            }

            const alternative = await this.offsets(reference.source, target, signal);
            if (alternative?.length) {
                return alternative;
            }
        }

        return null;
    }

    private preferredKind(kinds: SubtitleKind[], audioMode: AudioMode) {
        if (audioMode === 'sub' && kinds.includes('translated')) {
            return 'translated';
        }
        return (
            (['full', 'sdh', 'forced', 'translated'] as const).find((kind) =>
                kinds.includes(kind)
            ) ?? null
        );
    }

    private offerAvailable(sources: Sources, mode: AudioMode) {
        const source = (sources[mode] ?? []).find((candidate) => {
            const tracks = subtitleTracks(sources, mode, candidate);
            return tracks.own.length > 0 || tracks.sub !== null;
        });
        const tracks = subtitleTracks(sources, mode, source);
        const kinds = tracks.own.map(({ kind }) => kind);
        if (mode === 'dub' && tracks.own.length === 0 && tracks.sub) {
            kinds.push('translated');
        }
        this.options = subtitleOptionsFor(kinds);
        this.mode = 'off';
    }

    async load(sources: Sources, mode: AudioMode, active: Stream | undefined, source: string) {
        this.clear();
        const request = new AbortController();
        this.request = request;
        this.source = source;
        const { own, sub } = subtitleTracks(sources, mode, active);
        // A later source selection aborts this work; never publish cues that
        // were calibrated for an encode the player no longer uses.
        const stale = () =>
            request.signal.aborted || this.request !== request || source !== this.source;

        if (!active || (own.length === 0 && !sub)) {
            this.offerAvailable(sources, mode);
            return false;
        }

        try {
            const ownCues = await Promise.all(
                own.map((track) => this.fetchCues(track.url, request.signal))
            );
            const subCues = sub ? await this.fetchCues(sub.url, request.signal) : null;

            if (stale()) {
                return null;
            }

            const kinds: SubtitleKind[] = [];
            own.forEach((track, index) => {
                const cues = ownCues[index];
                if (!cues || kinds.includes(track.kind)) {
                    return;
                }
                this.loaded[track.kind] = cues;
                kinds.push(track.kind);
            });

            if (mode === 'dub' && own.length === 0 && sub && subCues) {
                let offsets: Awaited<ReturnType<Captions['fallbackOffsets']>> = null;
                try {
                    offsets = await this.fallbackOffsets(
                        sources,
                        sub,
                        active,
                        subCues,
                        request.signal
                    );
                } catch {
                    offsets = null;
                }
                if (stale()) {
                    return null;
                }
                this.loaded.translated = offsets?.length
                    ? alignSubtitleCues(subCues, offsets)
                    : subCues;
                kinds.push('translated');
            }

            this.options = subtitleOptionsFor(kinds);
            const selectedKind = this.preferredKind(kinds, mode);
            if (this.enabled && selectedKind) {
                this.mode = selectedKind;
                this.cues = this.loaded[selectedKind] ?? [];
            } else {
                this.mode = 'off';
                this.cues = [];
            }

            if (!kinds.length) {
                console.warn('Subtitle track could not be loaded or aligned');
            }
            return mode === 'sub'
                ? kinds.includes('full') || kinds.includes('sdh')
                : kinds.length > 0;
        } catch (cause) {
            if (stale()) {
                return null;
            }

            this.offerAvailable(sources, mode);
            console.warn('Subtitle track could not be loaded or aligned', cause);
            return false;
        }
    }
}
