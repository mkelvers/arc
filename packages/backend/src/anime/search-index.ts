import { desc, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import {
    animeSearchText,
    AnimeSearchResultSchema,
    rankAnimeSearch,
    searchRelevance,
    type AnimeSearchResult,
} from '@arc/shared/search';
import type * as schema from '@arc/db/schema';
import { animeSearchIndex as animeSearchIndexTable } from '@arc/db/schema';
import { excluded } from '@arc/db/sql';

type SearchDatabase = Pick<PostgresJsDatabase<typeof schema>, 'insert' | 'select'>;

export function createAnimeSearchIndex(database: SearchDatabase) {
    return {
        async find(query: string) {
            const normalized = animeSearchText([query]);
            if (!normalized) {
                return [];
            }

            const similarity = sql<number>`greatest(
                similarity(${animeSearchIndexTable.searchText}, ${normalized}),
                word_similarity(${normalized}, ${animeSearchIndexTable.searchText})
            )`;
            const rows = await database
                .select({
                    data: animeSearchIndexTable.data,
                    similarity,
                })
                .from(animeSearchIndexTable)
                .where(
                    sql`${animeSearchIndexTable.searchText} % ${normalized}
                        or ${normalized} <% ${animeSearchIndexTable.searchText}`
                )
                .orderBy(desc(similarity))
                .limit(80);
            const candidates = rows.flatMap(({ data }) => {
                const result = AnimeSearchResultSchema.safeParse(data);
                return result.success && searchRelevance(query, result.data.titles) > 0
                    ? [result.data]
                    : [];
            });

            return rankAnimeSearch(query, candidates).slice(0, 50);
        },

        async store(results: AnimeSearchResult[]) {
            if (!results.length) {
                return;
            }

            await database
                .insert(animeSearchIndexTable)
                .values(
                    results.map((result) => ({
                        anilistId: result.id,
                        searchText: animeSearchText(result.titles),
                        data: result,
                    }))
                )
                .onConflictDoUpdate({
                    target: animeSearchIndexTable.anilistId,
                    set: {
                        searchText: excluded(animeSearchIndexTable.searchText),
                        data: excluded(animeSearchIndexTable.data),
                        updatedAt: new Date(),
                    },
                });
        },
    };
}
