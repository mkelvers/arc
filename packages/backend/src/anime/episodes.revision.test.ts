import { describe, expect, test } from 'bun:test';

import { episodeRevision } from './episodes/revision';

describe('episode page revision', () => {
    test('changes after a metadata-only sync', () => {
        const before = episodeRevision({
            sourceRevision: 'inventory',
            mediaStatus: 'RELEASING',
            nextAiringAt: new Date('2026-09-04T14:30:00.000Z'),
            nextAiringEpisode: 8,
            lastSuccessAt: new Date('2026-08-28T15:30:24.452Z'),
        });
        const after = episodeRevision({
            sourceRevision: 'inventory',
            mediaStatus: 'RELEASING',
            nextAiringAt: new Date('2026-09-04T14:30:00.000Z'),
            nextAiringEpisode: 8,
            lastSuccessAt: new Date('2026-08-28T16:19:13.175Z'),
        });

        expect(after).not.toBe(before);
    });
});
