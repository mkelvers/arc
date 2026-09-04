import { z } from 'zod';

const airingMediaSchema = z.object({
    id: z.number().int().positive(),
    nextAiringEpisode: z
        .object({
            airingAt: z.number().int().positive(),
            episode: z.number().int().positive(),
        })
        .nullable(),
    airingSchedule: z
        .object({
            pageInfo: z
                .object({
                    lastPage: z.number().int().positive().nullable(),
                })
                .nullable(),
            nodes: z
                .array(
                    z
                        .object({
                            airingAt: z.number().int().positive(),
                            episode: z.number().int().positive(),
                        })
                        .nullable()
                )
                .nullable(),
        })
        .nullable(),
});

type DeepPartial<T> =
    T extends Array<infer Item>
        ? DeepPartial<Item>[]
        : T extends null
          ? null
          : T extends object
            ? { [Key in keyof T]?: DeepPartial<T[Key]> }
            : T;

type AiringMediaInput = DeepPartial<z.output<typeof airingMediaSchema>>;

export interface AiringAnime {
    id: number;
    nextAiringAt: number | null;
    nextAiringEpisode: number | null;
    latestAiredAt: number | null;
    latestAiredEpisode: number | null;
}

export interface AiringPageEntry extends AiringAnime {
    scheduleLastPage: number;
}

export function parseAiringMedia(value: AiringMediaInput, now: Date): AiringPageEntry {
    const parsed = airingMediaSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error('AniList returned invalid airing discovery data', {
            cause: parsed.error,
        });
    }

    const latest = parsed.data.airingSchedule?.nodes
        ?.filter(
            (entry): entry is NonNullable<typeof entry> =>
                entry !== null && entry.airingAt * 1_000 <= now.getTime()
        )
        .sort((left, right) => right.airingAt - left.airingAt)[0];

    return {
        id: parsed.data.id,
        nextAiringAt: parsed.data.nextAiringEpisode?.airingAt ?? null,
        nextAiringEpisode: parsed.data.nextAiringEpisode?.episode ?? null,
        latestAiredAt: latest?.airingAt ?? null,
        latestAiredEpisode: latest?.episode ?? null,
        scheduleLastPage: parsed.data.airingSchedule?.pageInfo?.lastPage ?? 1,
    };
}
