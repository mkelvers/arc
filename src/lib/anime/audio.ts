const audioModes = ['sub', 'dub', 'raw'] as const;

export type AudioMode = (typeof audioModes)[number];

const audioLabel = {
  sub: 'Sub',
  dub: 'Dub',
  raw: 'Raw',
} satisfies Record<AudioMode, string>;

const audioRank = new Map<AudioMode, number>(audioModes.map((mode, index) => [mode, index]));

const audioLabelRank = new Map<AudioMode, number>(
  (['dub', 'sub', 'raw'] satisfies AudioMode[]).map((mode, index) => [mode, index])
);

function orderedAudio(modes: readonly AudioMode[]) {
  return [...new Set(modes)].toSorted(
    (left, right) => audioRank.get(left)! - audioRank.get(right)!
  );
}

export function audioAvailabilityLabel<const Modes extends readonly AudioMode[]>(modes: Modes) {
  const ordered = orderedAudio(modes);
  if (ordered.length === 1 && ordered[0] === 'sub') return 'Subtitled';
  if (ordered.length === 1 && ordered[0] === 'dub') return 'Dubbed';

  return ordered
    .toSorted((left, right) => audioLabelRank.get(left)! - audioLabelRank.get(right)!)
    .map((mode) => audioLabel[mode])
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
