import { describe, expect, test } from 'bun:test';

import { toAnimeDetails } from './details';
import type { AniListAnime } from './anilist/types';

describe('anime details airing state', () => {
    test('hides a next airing event that has already passed', () => {
        const details = toAnimeDetails({
            id: 196187,
            status: 'RELEASING',
            nextAiringEpisode: {
                episode: 6,
                airingAt: Math.floor(Date.now() / 1_000) - 1,
            },
        } as AniListAnime);

        expect(details.nextAiringEpisode).toBeNull();
    });

    test('keeps a future next airing event', () => {
        const nextAiringEpisode = {
            episode: 7,
            airingAt: Math.floor(Date.now() / 1_000) + 60,
        };
        const details = toAnimeDetails({
            id: 196187,
            status: 'RELEASING',
            nextAiringEpisode,
        } as AniListAnime);

        expect(details.nextAiringEpisode).toEqual(nextAiringEpisode);
    });

    test('keeps a provider-unconfirmed airing event after its scheduled time', () => {
        const nextAiringEpisode = {
            episode: 18,
            airingAt: Math.floor(Date.now() / 1_000) - 1,
        };
        const details = toAnimeDetails(
            {
                id: 196187,
                status: 'RELEASING',
                nextAiringEpisode: {
                    episode: 19,
                    airingAt: nextAiringEpisode.airingAt + 7 * 86400,
                },
            } as AniListAnime,
            undefined,
            nextAiringEpisode
        );

        expect(details.nextAiringEpisode).toEqual(nextAiringEpisode);
    });
});
