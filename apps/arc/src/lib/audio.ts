export const audioModeOrder = ['sub', 'dub', 'raw'] as const;

export type AudioMode = (typeof audioModeOrder)[number];

function orderedAudio(modes: readonly AudioMode[]) {
    return [...new Set(modes)].toSorted(
        (left, right) => audioModeOrder.indexOf(left) - audioModeOrder.indexOf(right)
    );
}

export function audioAvailabilityLabel(modes: readonly AudioMode[]) {
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

export function episodeAudioAvailabilityLabel(
    episodes: readonly { audio: readonly AudioMode[] }[]
) {
    return audioAvailabilityLabel(episodes.flatMap((episode) => episode.audio));
}

export function mergeAudioModes(
    stored: readonly AudioMode[] = [],
    observed: readonly AudioMode[] = []
) {
    return orderedAudio([...stored, ...observed]);
}
