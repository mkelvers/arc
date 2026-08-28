import { createHash } from 'node:crypto';

export function episodeRevision(state: {
    sourceRevision: string | null;
    mediaStatus: string | null;
    nextAiringAt: Date | null;
    nextAiringEpisode: number | null;
    lastSuccessAt: Date | null;
}) {
    return createHash('sha256')
        .update(
            JSON.stringify({
                sourceRevision: state.sourceRevision,
                mediaStatus: state.mediaStatus,
                nextAiringAt: state.nextAiringAt?.toISOString() ?? null,
                nextAiringEpisode: state.nextAiringEpisode,
                lastSuccessAt: state.lastSuccessAt?.toISOString() ?? null,
            })
        )
        .digest('hex');
}
