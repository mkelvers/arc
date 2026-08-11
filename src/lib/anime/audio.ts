const audioModes = ['sub', 'dub', 'raw'] as const;

export type AudioMode = (typeof audioModes)[number];

const audioRank = new Map<AudioMode, number>(audioModes.map((mode, index) => [mode, index]));

function orderedAudio(modes: readonly AudioMode[]) {
    return [...new Set(modes)].toSorted(
        (left, right) => audioRank.get(left)! - audioRank.get(right)!
    );
}

export function audioAvailabilityLabel<const Modes extends readonly AudioMode[]>(modes: Modes) {
    const ordered = orderedAudio(modes).map((mode) => (mode === 'raw' ? 'sub' : mode));
    const available = [...new Set(ordered)];
    if (available.length === 1 && available[0] === 'sub') {
        return 'Subtitled';
    }

    if (available.length === 1 && available[0] === 'dub') {
        return 'Dubbed';
    }

    return (['dub', 'sub'] as const)
        .filter((mode) => available.includes(mode))
        .map((mode) => (mode === 'dub' ? 'Dub' : 'Sub'))
        .join(' | ');
}

export function episodeAudioAvailabilityLabel<Episode extends { audio: readonly AudioMode[] }>(
    episodes: readonly Episode[]
) {
    return audioAvailabilityLabel(episodes.flatMap((episode) => episode.audio));
}

export function mergeAudioModes(
    stored: readonly AudioMode[] = [],
    observed: readonly AudioMode[] = []
) {
    return orderedAudio([...stored, ...observed]);
}
