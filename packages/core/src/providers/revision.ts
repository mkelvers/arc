import { createHash } from 'node:crypto';

import type { AudioMode } from '../audio';

export function sourceRevision(
    episodes: ReadonlyArray<{
        id: string;
        number: number;
        title: string;
        audio: AudioMode[];
    }>
) {
    return createHash('sha256')
        .update(
            JSON.stringify(
                episodes.map(({ id, number, title, audio }) => ({
                    id,
                    number,
                    title,
                    audio: audio.toSorted(),
                }))
            )
        )
        .digest('hex');
}
