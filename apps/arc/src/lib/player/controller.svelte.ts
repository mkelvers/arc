import { isControl, shortcut, type Sources } from './media';
import { Playback } from './playback.svelte';
import { PlaybackProgress } from './progress-client';
import { SegmentEditor } from './segments.svelte';
import {
    activeSkip,
    type EpisodeSkipTimes,
    type SegmentTemplates,
} from '@arc/shared/player/skip-times';

interface PlayerInput {
    animeId: number;
    episodeId: string;
    episodeNumber: number;
    next: string | null;
    progressEventAt: number;
    sources: Sources;
    startAt: number;
    segments: {
        canEdit: boolean;
        times: EpisodeSkipTimes;
        templates: SegmentTemplates;
    };
}

type SettingsView =
    | 'main'
    | 'audio'
    | 'subtitles'
    | 'subtitle-size'
    | 'quality'
    | 'segments'
    | 'segment-opening'
    | 'segment-ending';

export class Player {
    container!: HTMLElement;
    controlsVisible = $state(true);
    fullscreen = $state(false);
    settingsOpen = $state(false);
    settingsView = $state<SettingsView>('main');
    changingEpisode = $state(false);
    readonly media: Playback;
    readonly segments: SegmentEditor;

    private readonly progress: PlaybackProgress;
    private hideControlsTimer: ReturnType<typeof setTimeout> | undefined;
    private mounted = false;
    private input: PlayerInput;

    constructor(input: PlayerInput) {
        this.input = input;
        const episode = {
            animeId: input.animeId,
            episodeId: input.episodeId,
            episodeNumber: input.episodeNumber,
        };
        this.media = new Playback(input.sources, input.next);
        this.progress = new PlaybackProgress(this.media, episode, input.progressEventAt);
        this.segments = new SegmentEditor(
            episode,
            input.segments.times,
            input.segments.templates,
            input.segments.canEdit
        );
    }

    get visibleSkip() {
        return activeSkip(this.segments.times, this.media.currentTime);
    }

    sync(input: PlayerInput) {
        const episode = {
            animeId: input.animeId,
            episodeId: input.episodeId,
            episodeNumber: input.episodeNumber,
        };
        const episodeChanged =
            episode.animeId !== this.input.animeId || episode.episodeId !== this.input.episodeId;
        this.input = input;
        this.media.sync(input.sources, input.next);
        this.progress.syncEvent(input.progressEventAt);
        this.segments.sync(
            episode,
            input.segments.times,
            input.segments.templates,
            input.segments.canEdit
        );

        if (!episodeChanged) {
            return;
        }

        this.progress.changeEpisode(episode, episodeChanged);

        if (this.mounted) {
            this.changingEpisode = true;
            void this.media.changeEpisode();
        }
    }

    showControls() {
        this.controlsVisible = true;
        clearTimeout(this.hideControlsTimer);

        if (this.media.playing && !this.media.scrubbing && !this.settingsOpen) {
            this.hideControlsTimer = setTimeout(() => {
                this.controlsVisible = false;
            }, 2_000);
        }
    }

    async toggleFullscreen() {
        if (document.fullscreenElement === this.container) {
            await document.exitFullscreen();
            return;
        }

        await this.container.requestFullscreen();
    }

    private handleClick(event: MouseEvent) {
        if (this.media.loading || isControl(event.target)) {
            return;
        }

        this.focus();
        this.media.togglePlayback();
        this.showControls();
    }

    private handleDoubleClick(event: MouseEvent) {
        if (this.media.loading || isControl(event.target)) {
            return;
        }

        void this.toggleFullscreen();
        this.showControls();
    }

    private handleKeydown(event: KeyboardEvent) {
        if (event.code === 'Escape' && this.settingsOpen) {
            event.preventDefault();
            this.closeSettings();
            return;
        }

        const action = shortcut(event);
        if (!action) {
            return;
        }

        event.preventDefault();

        switch (action) {
            case 'play':
                this.media.togglePlayback();
                break;
            case 'mute':
                this.media.toggleMute();
                break;
            case 'fullscreen':
                void this.toggleFullscreen();
                break;
            case 'start':
                this.media.seek(0);
                break;
            case 'end':
                this.media.seek(this.media.duration);
                break;
            default:
                if ('seek' in action) {
                    this.media.seekBy(action.seek);
                } else if ('volume' in action) {
                    this.media.changeVolume(action.volume);
                } else {
                    this.media.seek(this.media.duration * action.percent);
                }
        }

        this.showControls();
    }

    private handlePointerMove(event: PointerEvent) {
        const bounds = this.container?.getBoundingClientRect();

        if (
            bounds &&
            event.clientX >= bounds.left &&
            event.clientX <= bounds.right &&
            event.clientY >= bounds.top &&
            event.clientY <= bounds.bottom
        ) {
            this.showControls();
        }
    }

    openSettings() {
        if (!this.settingsOpen) {
            this.settingsView = 'main';
        }

        this.settingsOpen = !this.settingsOpen;
        this.showControls();
    }

    closeSettings() {
        if (this.settingsView === 'main') {
            this.settingsOpen = false;
        } else {
            this.settingsView = 'main';
        }

        this.showControls();
    }

    focus() {
        this.container.focus({ preventScroll: true });
    }

    private fullscreenChanged() {
        this.fullscreen = document.fullscreenElement === this.container;
        this.showControls();
    }

    mount() {
        const events = new AbortController();
        const { signal } = events;
        const video = this.media.video;

        // Player owns the browser/media lifecycle so progress ordering and
        // teardown cannot drift across component event callbacks.
        this.container.addEventListener('click', (event) => this.handleClick(event), { signal });
        this.container.addEventListener('dblclick', (event) => this.handleDoubleClick(event), {
            signal,
        });
        this.container.addEventListener('keydown', (event) => this.handleKeydown(event), {
            signal,
        });
        window.addEventListener('pointermove', (event) => this.handlePointerMove(event), {
            signal,
        });
        window.addEventListener('fullscreenchange', () => this.fullscreenChanged(), { signal });
        window.addEventListener('pagehide', () => this.progress.leavePage(), { signal });
        window.addEventListener('pageshow', () => this.progress.resumePage(), { signal });

        video.addEventListener('loadstart', () => (this.media.loading = true), { signal });
        video.addEventListener(
            'loadedmetadata',
            () => {
                this.changingEpisode = false;
                this.media.handleMetadata(this.input.startAt);
                this.progress.metadataLoaded();
            },
            { signal }
        );
        video.addEventListener('durationchange', () => (this.media.duration = video.duration), {
            signal,
        });
        video.addEventListener('seeked', () => this.media.handleSeeked(), { signal });
        video.addEventListener('timeupdate', () => this.progress.timeUpdated(), { signal });
        video.addEventListener('progress', () => this.media.updateBuffered(), { signal });
        video.addEventListener('waiting', () => this.media.handleWaiting(), { signal });
        video.addEventListener('canplay', () => this.media.handleCanPlay(), { signal });
        video.addEventListener('error', () => void this.media.tryNextSource(), { signal });
        video.addEventListener('play', () => this.progress.played(), { signal });
        video.addEventListener(
            'playing',
            () => {
                this.media.handlePlaying();
                this.showControls();
            },
            { signal }
        );
        video.addEventListener(
            'pause',
            () => {
                this.media.playing = false;
                this.showControls();
                this.progress.paused(this.changingEpisode);
            },
            { signal }
        );
        video.addEventListener(
            'ended',
            () => {
                void this.progress.playbackEnded().then(() => {
                    this.media.ended();
                    this.showControls();
                });
            },
            { signal }
        );
        video.addEventListener('volumechange', () => this.media.volumeChanged(), { signal });

        this.mounted = true;
        this.progress.mount(this.input.progressEventAt);
        const closeMedia = this.media.mount();

        return () => {
            events.abort();
            this.mounted = false;
            clearTimeout(this.hideControlsTimer);
            this.progress.leavePage();
            closeMedia();
        };
    }
}
