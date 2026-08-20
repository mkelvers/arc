import { env } from '$env/dynamic/private';
import { z } from 'zod';

const changeItemSchema = z.object({
    iso_639_1: z.string().optional(),
    iso_3166_1: z.string().optional(),
    value: z.string().default(''),
});
const changeSchema = z.object({
    key: z.string().optional(),
    items: z.array(changeItemSchema).optional(),
});
const changesResponseSchema = z.object({ changes: z.array(changeSchema).optional() });

export async function getEpisodeEnglishOverview(
    episodeId: number | undefined,
    startDate: string,
    request: typeof fetch = fetch
) {
    const token = env.TMDB_READ_ACCESS_TOKEN?.trim();
    if (!token || !episodeId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return null;
    }

    const endDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const query = new URLSearchParams({ start_date: startDate, end_date: endDate });
    const response = await request(
        `https://api.themoviedb.org/3/tv/episode/${episodeId}/changes?${query}`,
        {
            headers: {
                accept: 'application/json',
                Authorization: `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(8_000),
        }
    );

    if (!response.ok) {
        throw new Error(`TMDB episode changes request failed with status ${response.status}`);
    }

    const payload = changesResponseSchema.parse(await response.json());
    const overviewChanges = (payload.changes ?? [])
        .filter((change) => change.key === 'overview')
        .flatMap((change) => change.items ?? []);
    const overview = overviewChanges
        .toReversed()
        .find((item) => item.iso_639_1 === 'en' && item.iso_3166_1 === 'US' && item.value.trim());

    return overview?.value.trim() ?? null;
}
