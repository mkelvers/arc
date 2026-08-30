import * as preferences from './preferences';

export const audioOptions = ['auto', 'sub', 'dub'] as const;
export const qualityOptions = ['best', '1080p', '720p', '480p'] as const;
type PreferredAudio = (typeof audioOptions)[number];
export type PlaybackQuality = (typeof qualityOptions)[number];

export class PlaybackPreferences {
    autoplay = $state(true);
    audioMode = $state<PreferredAudio>('auto');
    quality = $state<PlaybackQuality>('best');
    subtitlesEnabled = $state(false);

    load() {
        const saved = preferences.load({}, []);
        this.autoplay = saved.autoplay ?? this.autoplay;
        if (saved.preferredMode === 'sub' || saved.preferredMode === 'dub') {
            this.audioMode = saved.preferredMode;
        }
        if (saved.quality && qualityOptions.includes(saved.quality as PlaybackQuality)) {
            this.quality = saved.quality as PlaybackQuality;
        }
        this.subtitlesEnabled = saved.subtitleEnabled ?? this.subtitlesEnabled;
    }

    setAutoplay(value: boolean) {
        this.autoplay = value;
        preferences.save('autoplay', value);
    }

    setAudioMode(value: PreferredAudio) {
        this.audioMode = value;
        preferences.save('audio-mode', value);
    }

    setQuality(value: PlaybackQuality) {
        this.quality = value;
        preferences.save('quality', value);
    }

    setSubtitlesEnabled(value: boolean) {
        this.subtitlesEnabled = value;
        preferences.save('subtitles', value);
        if (value) {
            preferences.save('subtitle-mode', 'translated');
        }
    }
}
