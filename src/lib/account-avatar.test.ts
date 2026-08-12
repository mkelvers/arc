import { describe, expect, test } from 'bun:test';

import { accountAvatar } from './account-avatar';

describe('account avatar', () => {
    test('uses the username initial and a stable color', () => {
        expect(accountAvatar('mikkel')).toEqual(accountAvatar('mikkel'));
        expect(accountAvatar('mikkel').initial).toBe('M');
    });

    test('varies the color across usernames', () => {
        const colors = new Set(
            ['mikkel', 'arc_user', 'sakura', 'naruto'].map(accountAvatar).map(({ color }) => color)
        );

        expect(colors.size).toBeGreaterThan(1);
    });
});
