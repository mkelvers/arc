import { describe, expect, test } from 'bun:test';

import {
    conciseHeroSynopsis,
    informativeHeroSynopsis,
    isSeasonPlaceholderSynopsis,
    isSeasonReleaseTitle,
} from '@arc/core';

describe('season placeholder synopsis detection', () => {
    test.each([
        'The third season of Mushoku Tensei.',
        'Second season of Frieren.',
        'The 2nd season of The Apothecary Diaries.',
        'Season third of Example.',
    ])('recognizes %s', (synopsis) => {
        expect(isSeasonPlaceholderSynopsis(synopsis)).toBe(true);
    });

    test('keeps an ordinary synopsis that happens to mention a later season', () => {
        expect(
            isSeasonPlaceholderSynopsis('After the second season, the heroes begin a new journey.')
        ).toBe(false);
    });

    test('recognizes season markers in release titles', () => {
        expect(isSeasonReleaseTitle('Re:ZERO -Starting Life in Another World- 4th Season')).toBe(
            true
        );
        expect(isSeasonReleaseTitle('A Story About a Regular Hero')).toBe(false);
    });

    test('keeps hero copy to two clean sentences without supplementary episode lists', () => {
        expect(
            conciseHeroSynopsis(
                'Monkey D. Luffy sets sail to become King of the Pirates. His crew crosses the Grand Line in search of the legendary One Piece. Along the way they meet countless allies and enemies. *This includes special episodes 336, 492, 590, and 907.'
            )
        ).toBe(
            'Monkey D. Luffy sets sail to become King of the Pirates. His crew crosses the Grand Line in search of the legendary One Piece.'
        );
    });

    test('uses a richer first-season summary when TMDB only states the premise', () => {
        expect(
            informativeHeroSynopsis(
                'Corporate worker Mikami Satoru is stabbed by a random killer, and is reborn to an alternate world. But he turns out to be reborn a slime!',
                'Lonely thirty-seven-year-old Satoru Mikami awakens to a fresh start in a fantasy realm as a slime monster! As he acclimates to his new existence, his exploits with the other monsters set off a chain of events that will change his new world forever!'
            )
        ).toBe(
            'Corporate worker Mikami Satoru is stabbed by a random killer, and is reborn to an alternate world. But he turns out to be reborn a slime! As he acclimates to his new existence, his exploits with the other monsters set off a chain of events that will change his new world forever!'
        );
    });

    test('does not use a short premise when a fuller story summary is available', () => {
        expect(
            informativeHeroSynopsis(
                'The awakening of a new Hero draws near!',
                'A new hero awakens in a world threatened by an ancient enemy. Alongside unlikely allies, they must uncover the truth behind the conflict and decide what they are willing to sacrifice to protect the people they love.'
            )
        ).toBe(
            'A new hero awakens in a world threatened by an ancient enemy. Alongside unlikely allies, they must uncover the truth behind the conflict and decide what they are willing to sacrifice to protect the people they love.'
        );
    });

    test('does not use a single plot sentence when a fuller story summary is available', () => {
        expect(
            informativeHeroSynopsis(
                'To save his stricken allies, Subaru faces a deadly desert to find the Sage at Pleiades Watchtower.',
                'After repeatedly confronting death, Subaru and his allies must cross a deadly desert and uncover the secrets of the Pleiades Watchtower. Their search for the Sage becomes a desperate battle against powerful enemies, forcing Subaru to risk everything to save the people who have fought alongside him.'
            )
        ).toBe(
            'After repeatedly confronting death, Subaru and his allies must cross a deadly desert and uncover the secrets of the Pleiades Watchtower. Their search for the Sage becomes a desperate battle against powerful enemies, forcing Subaru to risk everything to save the people who have fought alongside him.'
        );
    });
});
