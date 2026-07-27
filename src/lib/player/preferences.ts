import type { AudioMode } from '$lib/anime/audio';
import type { Sources } from './media';

type Key = 'audio-mode' | 'autoplay' | 'quality' | 'volume';

export function load(sources: Sources, qualities: string[]) {
    const rawVolume = localStorage.getItem('arc:volume');
    const volume = rawVolume === null ? null : Number(rawVolume);
    const rawMode = localStorage.getItem('arc:audio-mode');
    const mode =
        (rawMode === 'sub' || rawMode === 'dub' || rawMode === 'raw') &&
        sources[rawMode]?.length
            ? rawMode
            : null;
    const rawAutoplay = localStorage.getItem('arc:autoplay');
    const autoplay =
        rawAutoplay === 'true' || rawAutoplay === 'false'
            ? rawAutoplay === 'true'
            : null;
    const rawQuality = localStorage.getItem('arc:quality');
    const quality =
        rawQuality === 'best' || qualities.includes(rawQuality ?? '')
            ? (rawQuality ?? 'best')
            : null;

    return {
        volume:
            volume !== null &&
            Number.isFinite(volume) &&
            volume >= 0 &&
            volume <= 1
                ? volume
                : null,
        mode: mode as AudioMode | null,
        autoplay,
        quality,
    };
}

export function save(key: Key, value: string | number | boolean) {
    localStorage.setItem(`arc:${key}`, String(value));
}
