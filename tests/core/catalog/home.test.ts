import 'dotenv/config';

import { afterEach, describe, expect, test } from 'bun:test';
import { inArray } from 'drizzle-orm';

import { homeHeroRotationStart, homePage } from '@arc/core';
import { db } from '@arc/shared/db';
import { homeHeroCandidate, homeHeroSelection } from '@arc/shared/db/schema';
import type { CatalogSource } from '@arc/core';

const testNow = new Date('2099-01-02T00:00:00Z');
const rotationStart = homeHeroRotationStart(testNow);
const previousRotationStart = homeHeroRotationStart(
    new Date(testNow.getTime() - 3 * 24 * 60 * 60 * 1_000)
);
const storedIds = [990001, 990002, 990003, 990004, 990005, 990006];
const replacementIds = [990011, 990012, 990013, 990014, 990015, 990016];
const testIds = [...storedIds, ...replacementIds];

const source: Pick<CatalogSource, 'loadHomeHero' | 'continueWatching' | 'enrichAnimeCards'> = {
    loadHomeHero: async (id: number) =>
        [...storedIds.slice(0, 3), ...replacementIds].includes(id)
            ? {
                  id,
                  href: `/anime/${id}`,
                  link: `/anime/${id}/episode/1`,
                  episodeLabel: 'Episode 1',
                  title: `Anime ${id}`,
                  image: 'https://example.com/backdrop.jpg',
                  logo: { url: 'https://example.com/logo.png', size: 100 },
                  audioLabel: 'SUB',
                  genres: ['Action'],
                  description: 'Description',
              }
            : null,
    continueWatching: async () => [],
    enrichAnimeCards: async <T>(cards: T[]) => cards,
};

describe('homepage hero hydration', () => {
    afterEach(async () => {
        await db
            .delete(homeHeroSelection)
            .where(
                inArray(homeHeroSelection.rotationStart, [rotationStart, previousRotationStart])
            );
        await db.delete(homeHeroCandidate).where(inArray(homeHeroCandidate.anilistId, testIds));
    });

    test.skipIf(!process.env.DATABASE_URL)(
        'replaces stored hero entries that no longer hydrate instead of returning fewer than six',
        async () => {
            await db.insert(homeHeroSelection).values(
                storedIds.map((anilistId, position) => ({
                    rotationStart,
                    position,
                    anilistId,
                }))
            );
            await db.insert(homeHeroCandidate).values(
                replacementIds.map((anilistId, index) => ({
                    anilistId,
                    averageScore: 80,
                    trendingRank: index + 1,
                }))
            );

            const page = await homePage(source as CatalogSource, 'test-user', testNow);

            expect(page.highlights).toHaveLength(6);
            expect(page.highlights.map(({ id }) => id)).toEqual(replacementIds);
        }
    );

    test.skipIf(!process.env.DATABASE_URL)(
        'does not fall back to a partial previous rotation',
        async () => {
            await db.insert(homeHeroSelection).values(
                storedIds.slice(0, 3).map((anilistId, position) => ({
                    rotationStart: previousRotationStart,
                    position,
                    anilistId,
                }))
            );

            const page = await homePage(source as CatalogSource, 'test-user', testNow);

            expect(page.highlights).toHaveLength(0);
        }
    );
});
