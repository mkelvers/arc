import { describe, expect, mock, test } from 'bun:test';

mock.module('../providers/mapping', () => ({
    providerMediaId: async () => 'black-clover',
    saveProviderMediaId: async () => {},
    verifyProviderMediaId: async () => {},
}));
mock.module('./client', () => ({
    request: async () => ({
        show: { availableEpisodesDetail: { sub: ['29', '30'] } },
        episodeInfos: [
            { episodeIdNum: 29, notes: 'Path<note-split>RecapMichi (道)' },
            { episodeIdNum: 30, notes: 'The Mirror Mage' },
        ],
    }),
}));

const { getEpisodes } = await import('./catalog');

describe('AllAnime episode inventory', () => {
    test('preserves its explicit recap marker without calling it filler', async () => {
        expect(await getEpisodes({ id: 97940, idMal: 34572 } as never)).toEqual([
            {
                id: '29',
                number: 29,
                title: 'Path',
                audio: ['sub'],
                type: 'recap',
            },
            {
                id: '30',
                number: 30,
                title: 'The Mirror Mage',
                audio: ['sub'],
                type: undefined,
            },
        ]);
    });
});
