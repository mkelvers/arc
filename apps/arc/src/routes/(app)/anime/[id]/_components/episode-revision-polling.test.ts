import { describe, expect, test } from 'bun:test';

import { episodeRevisionPollInterval } from './episode-revision-polling';

describe('episodeRevisionPollInterval', () => {
    test('checks releasing pages every minute even before the next airing window', () => {
        expect(episodeRevisionPollInterval).toBe(60_000);
    });
});
