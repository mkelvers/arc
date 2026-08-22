import { expect, test } from 'bun:test';

import { mergeFillerClassifications } from './filler';
import type { ProviderEpisode } from './providers/types';

test('keeps dedicated filler above a provider recap marker', () => {
    const episodes: ProviderEpisode[] = Array.from({ length: 30 }, (_, index) => ({
        id: String(index + 1),
        number: index + 1,
        title: `Episode ${index + 1}`,
        audio: ['sub'],
    }));
    episodes[28].type = 'recap';

    expect(mergeFillerClassifications(episodes, new Map([[29, 'filler']]))[28].type).toBe('filler');
});
