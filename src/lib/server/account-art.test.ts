import { describe, expect, test } from 'bun:test';

import { accountArtStyle, renderAccountArt } from './account-art';

describe('account art', () => {
    test('selects one stable DiceBear style for a user', async () => {
        const first = await accountArtStyle('user-123');
        const second = await accountArtStyle('user-123');

        expect(first).toBe(second);
    });

    test('renders deterministic SVG art from the user ID', async () => {
        const first = await renderAccountArt('user-123');
        const second = await renderAccountArt('user-123');

        expect(first).toBe(second);
        expect(first.startsWith('<svg')).toBe(true);
    });

    test('can select and render every bundled DiceBear style', async () => {
        const userIds = new Map<string, string>();

        for (let index = 0; index < 5_000 && userIds.size < 50; index += 1) {
            const userId = `style-coverage-${index}`;
            userIds.set(await accountArtStyle(userId), userId);
        }

        expect(userIds.size).toBe(50);
        for (const userId of userIds.values()) {
            expect((await renderAccountArt(userId)).startsWith('<svg')).toBe(true);
        }
    });
});
