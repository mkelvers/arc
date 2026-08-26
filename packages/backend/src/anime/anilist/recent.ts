import { RecentAiringPageDocument } from '@arc/shared/anilist/generated/graphql';
import { z } from 'zod';
import { request } from './client';

const recentAiringSchema = z.object({
    episode: z.number().int().positive(),
    airingAt: z.number().int().positive(),
    media: z.object({ id: z.number().int().positive() }).nullable(),
});

export async function getRecentAiringPage(page: number, now = new Date()) {
    const response = await request(
        RecentAiringPageDocument,
        {
            page,
            perPage: 50,
            before: Math.floor(now.getTime() / 1_000) + 1,
        },
        { cacheForMs: 15 * 60 * 1_000 }
    );
    const schedules = (response.Page?.airingSchedules ?? []).flatMap((entry) => {
        const parsed = recentAiringSchema.safeParse(entry);
        return parsed.success && parsed.data.media
            ? [
                  {
                      anilistId: parsed.data.media.id,
                      episode: parsed.data.episode,
                      airedAt: new Date(parsed.data.airingAt * 1_000),
                  },
              ]
            : [];
    });

    return {
        schedules,
        hasNextPage: response.Page?.pageInfo?.hasNextPage === true,
    };
}
