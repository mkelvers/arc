import { nextProgressEventAt, ProgressSchedule } from './progress';

interface ProgressMedia {
    currentTime: number;
    playing: boolean;
    video: Pick<HTMLVideoElement, 'currentTime' | 'duration' | 'seeking'>;
    seeking: boolean;
}

interface Episode {
    animeId: number;
    episodeId: string;
    episodeNumber: number;
}

interface EventClock {
    base: number;
    startedAt: number;
}

interface ProgressPayload extends Episode {
    positionSeconds: number;
    durationSeconds: number;
    completed: boolean;
    eventAt: number;
}

export class PlaybackProgress {
    private schedule = new ProgressSchedule();
    private started = false;
    private eventClock: EventClock | null = null;
    private hasPlayed = false;
    private ended = false;
    private finalSaveSent = false;
    private saveQueue: Promise<void> = Promise.resolve();

    constructor(
        private readonly media: ProgressMedia,
        private episode: Episode,
        private eventCursor: number
    ) {}

    mount(eventAt: number) {
        this.eventCursor = Math.max(this.eventCursor, eventAt);
        this.eventClock = {
            base: this.eventCursor,
            startedAt: performance.now(),
        };
    }

    syncEvent(eventAt: number) {
        if (!this.eventClock || eventAt <= this.eventCursor) {
            return;
        }

        this.eventCursor = eventAt;
        this.eventClock = {
            base: eventAt,
            startedAt: performance.now(),
        };
    }

    changeEpisode(episode: Episode, changed: boolean) {
        if (changed && this.hasPlayed && !this.ended) {
            void this.save(false, true);
        }

        this.episode = episode;
        this.schedule = new ProgressSchedule();
        this.started = false;
        this.hasPlayed = false;
        this.ended = false;
        this.finalSaveSent = false;
    }

    metadataLoaded() {
        if (this.started) {
            return;
        }

        this.started = true;
        this.schedule.start(this.media.video.currentTime);
    }

    timeUpdated() {
        if (!this.media.seeking) {
            this.media.currentTime = this.media.video.currentTime;
        }

        const reason = this.schedule.update({
            currentTime: this.media.video.currentTime,
            duration: this.media.video.duration,
            playing: this.media.playing,
        });
        if (reason === 'ending') {
            this.ended = true;
            void this.save(true, true);
        } else if (reason === 'periodic') {
            void this.save();
        }
    }

    played() {
        this.hasPlayed = true;
        void this.save();
    }

    paused(changingEpisode: boolean) {
        if (
            !this.ended &&
            !changingEpisode &&
            (this.hasPlayed || this.media.currentTime > 0 || this.media.video.currentTime > 0)
        ) {
            this.hasPlayed = true;
            void this.save(false, true);
        }
    }

    async playbackEnded() {
        this.ended = true;
        this.media.currentTime = this.media.video.currentTime;
        await this.save(true, true);
    }

    resumePage() {
        this.finalSaveSent = false;
    }

    leavePage() {
        if (
            (!this.hasPlayed && this.media.currentTime <= 0 && this.media.video.currentTime <= 0) ||
            this.ended ||
            this.finalSaveSent
        ) {
            return;
        }

        this.finalSaveSent = true;
        void this.save(false, true);
    }

    private payload(completed: boolean): ProgressPayload | null {
        const positionSeconds = this.media.seeking
            ? this.media.currentTime
            : Math.max(this.media.currentTime, this.media.video?.currentTime ?? 0);
        const durationSeconds = this.media.video?.duration;

        if (
            !Number.isFinite(positionSeconds) ||
            !Number.isFinite(durationSeconds) ||
            durationSeconds <= 0
        ) {
            return null;
        }

        const estimatedServerTime = this.eventClock
            ? this.eventClock.base + performance.now() - this.eventClock.startedAt
            : this.eventCursor + 1;
        this.eventCursor = nextProgressEventAt(this.eventCursor, estimatedServerTime);

        return {
            ...this.episode,
            positionSeconds,
            durationSeconds,
            completed,
            eventAt: this.eventCursor,
        };
    }

    private async send(payload: ProgressPayload, keepalive = false) {
        const response = await fetch('/v1/progress', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify(payload),
            credentials: 'same-origin',
            keepalive,
        });

        if (!response.ok) {
            throw new Error(`Progress request failed with ${response.status}`);
        }
    }

    private save(completed = false, keepalive = false) {
        const payload = this.payload(completed);
        if (!payload) {
            return Promise.resolve();
        }

        this.saveQueue = this.saveQueue
            .then(() => this.send(payload, keepalive))
            .catch((cause) => {
                console.error('Playback progress save failed', cause);
            });

        return this.saveQueue;
    }
}
