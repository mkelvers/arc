import type { AudioMode } from '$lib/anime/audio';
import {
    alignSubtitleCues,
    hasDialogueCoverage,
    hlsTimeline,
    hlsTimelineOffsets,
    isHlsSource,
    parseWebVtt,
    sameSubtitleCues,
    streamsFor,
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
    mode = $state<SubtitleMode>('dub');
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
            const response = await fetch(url, { signal });
            if (!response.ok) {
                return null;
            }

            const cues = parseWebVtt(await response.text());
            return cues.length ? cues : null;
        } catch {
            return null;
        }
    }

    private async fetchTimeline(source: string, signal: AbortSignal) {
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

    private async offsets(reference: Stream, target: Stream, signal: AbortSignal) {
        if (reference.url === target.url) {
            return [{ at: 0, offset: 0 }];
        }

        const [referenceTimeline, targetTimeline] = await Promise.all([
            this.fetchTimeline(reference.url, signal),
            this.fetchTimeline(target.url, signal),
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

    private preferredKind(kinds: SubtitleKind[]) {
        if (this.mode === 'sub' && kinds.includes('translated')) {
            return 'translated';
        }
        if (this.mode === 'dub') {
            if (kinds.includes('cc')) {
                return 'cc';
            }
            if (kinds.includes('limited')) {
                return 'limited';
            }
        }
        if (kinds.includes('cc')) {
            return 'cc';
        }
        if (kinds.includes('translated')) {
            return 'translated';
        }
        return kinds.includes('limited') ? 'limited' : null;
    }

    private offerAvailable(sources: Sources, mode: AudioMode) {
        const source = streamsFor(sources, mode).find((candidate) => {
            const tracks = subtitleTracks(sources, mode, candidate);
            return Boolean(tracks.own || tracks.sub);
        });
        const tracks = subtitleTracks(sources, mode, source);
        const kinds: SubtitleKind[] = [];
        if (mode === 'dub') {
            if (tracks.own) {
                kinds.push('limited');
            }
            if (tracks.sub) {
                kinds.push('translated');
            }
        } else if (tracks.own) {
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

        if (!active || (!own && !sub)) {
            this.offerAvailable(sources, mode);
            return;
        }

        try {
            const ownRequest = own
                ? this.fetchCues(own.url, request.signal)
                : Promise.resolve(null);
            const subRequest =
                sub && sub.url !== own?.url ? this.fetchCues(sub.url, request.signal) : ownRequest;
            const [ownCues, subCues] = await Promise.all([ownRequest, subRequest]);

            if (stale()) {
                return;
            }

            const kinds: SubtitleKind[] = [];

            // The active encode's own track is dub CC (or signs) on a dub and
            // the translated dialogue on a sub/raw encode.
            if (ownCues) {
                const kind =
                    mode === 'dub'
                        ? hasDialogueCoverage(ownCues.length, subCues?.length ?? 0)
                            ? 'cc'
                            : 'limited'
                        : 'translated';
                this.loaded[kind === 'translated' ? 'sub' : 'dub'] = ownCues;
                kinds.push(kind);
            }

            // A translated track is offered on a dub only when it can be
            // calibrated to the selected provider encode.
            if (mode === 'dub' && sub && subCues) {
                const offsets = await this.fallbackOffsets(
                    sources,
                    sub,
                    active,
                    subCues,
                    request.signal
                );
                if (stale()) {
                    return;
                }
                if (offsets?.length) {
                    this.loaded.sub = alignSubtitleCues(subCues, offsets);
                    if (!kinds.includes('translated')) {
                        kinds.push('translated');
                    }
                }
            }

            this.options = subtitleOptionsFor(kinds);
            const selectedKind = this.preferredKind(kinds);
            if (this.enabled && selectedKind) {
                this.mode = selectedKind === 'translated' ? 'sub' : 'dub';
                this.cues = this.loaded[this.mode] ?? [];
            } else {
                this.mode = 'off';
                this.cues = [];
            }

            if (!kinds.length) {
                console.warn('Subtitle track could not be loaded or aligned');
            }
        } catch (cause) {
            if (stale()) {
                return;
            }

            this.offerAvailable(sources, mode);
            console.warn('Subtitle track could not be loaded or aligned', cause);
        }
    }
}
