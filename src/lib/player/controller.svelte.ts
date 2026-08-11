import { isControl, shortcut, type SettingsView, type Sources } from './media';
import { Playback } from './playback.svelte';

export class Player {
    container!: HTMLElement;
    controlsVisible = $state(true);
    fullscreen = $state(false);
    scrubbing = $state(false);
    settingsOpen = $state(false);
    settingsView = $state<SettingsView>('main');
    readonly media: Playback;

    private hideControlsTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(readSources: () => Sources, readNext: () => string | null) {
        this.media = new Playback(
            readSources,
            readNext,
            () => this.scrubbing,
            () => this.showControls()
        );
    }

    showControls() {
        this.controlsVisible = true;
        clearTimeout(this.hideControlsTimer);

        if (this.media.playing && !this.scrubbing && !this.settingsOpen) {
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

    handleClick(event: MouseEvent) {
        this.focus();

        if (this.media.loading || isControl(event.target)) {
            return;
        }

        this.media.togglePlayback();
        this.showControls();
    }

    handleDoubleClick(event: MouseEvent) {
        if (this.media.loading || isControl(event.target)) {
            return;
        }

        void this.toggleFullscreen();
        this.showControls();
    }

    handleKeydown(event: KeyboardEvent) {
        if (event.code === 'Escape' && this.settingsOpen) {
            event.preventDefault();
            this.closeSettings();
            return;
        }

        if (this.media.loading) {
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
                    this.media.seek(this.media.video.currentTime + action.seek);
                } else if ('volume' in action) {
                    this.media.changeVolume(action.volume);
                } else {
                    this.media.seek(this.media.duration * action.percent);
                }
        }

        this.showControls();
    }

    handlePointerMove(event: PointerEvent) {
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

    setScrubbing(active: boolean) {
        this.scrubbing = active;

        if (active) {
            this.media.syncAudio(true);
        }
    }

    focus() {
        this.container.focus({ preventScroll: true });
    }

    fullscreenChanged() {
        this.fullscreen = document.fullscreenElement === this.container;
        this.showControls();
    }

    mount() {
        const closeMedia = this.media.mount();

        return () => {
            clearTimeout(this.hideControlsTimer);
            closeMedia();
        };
    }
}
