import { describe, expect, test } from 'bun:test';

import { parseReAnimeLinks } from './reanime';

describe('ReAnime stream modes', () => {
    test('does not claim one iframe URL as both Japanese and English audio', () => {
        expect(
            parseReAnimeLinks({
                success: true,
                servers: [
                    {
                        dataType: 'sub',
                        dataLink: 'https://player.example/embed/episode-5',
                    },
                    {
                        dataType: 'dub',
                        dataLink: 'https://player.example/embed/episode-5',
                    },
                ],
            })
        ).toEqual([
            {
                mode: 'sub',
                url: 'https://player.example/embed/episode-5',
            },
        ]);
    });
});
