import { describe, expect, test } from 'bun:test';

import {
    conciseHeroSynopsis,
    informativeHeroSynopsis,
    isSeasonPlaceholderSynopsis,
} from './selection';

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
});
