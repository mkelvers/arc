import { z } from 'zod';

const changeItemSchema = z.object({
    iso_639_1: z.string().optional(),
    iso_3166_1: z.string().optional(),
    value: z.union([
        z.string(),
        z.number(),
        z.object({
            backdrop: z.object({ file_path: z.string().nullish() }).optional(),
        }),
    ]),
});
const changeSchema = z.object({
    key: z.string().optional(),
    items: z.array(changeItemSchema).optional(),
});
const changesResponseSchema = z.object({ changes: z.array(changeSchema).optional() });
type ChangesResponse = z.infer<typeof changesResponseSchema>;
const textValueSchema = z.string().trim().min(1);
const runtimeValueSchema = z.number().finite().positive();
const imageValueSchema = z.object({
    backdrop: z.object({ file_path: z.string().trim().min(1).nullish() }).optional(),
});

function changedEpisodeDetails(payload: ChangesResponse) {
    const changes = payload.changes ?? [];
    const items = (key: string) =>
        changes
            .filter((change) => change.key === key)
            .flatMap((change) => change.items ?? [])
            .toReversed();
    const englishText = (key: string) => {
        const localized = items(key).flatMap((item) => {
            const value = textValueSchema.safeParse(item.value);
            return item.iso_639_1 === 'en' && value.success ? [{ ...item, value: value.data }] : [];
        });
        return (
            localized.find((item) => item.iso_3166_1 === 'US')?.value ?? localized[0]?.value ?? null
        );
    };
    const runtime = items('runtime')
        .map((item) => runtimeValueSchema.safeParse(item.value))
        .find((value) => value.success)?.data;
    const stillPath = items('images')
        .map((item) => imageValueSchema.safeParse(item.value))
        .filter((value) => value.success)
        .map((value) => value.data.backdrop?.file_path)
        .find(Boolean);

    return {
        name: englishText('name'),
        overview: englishText('overview'),
        runtime: runtime ?? null,
        stillPath: stillPath ?? null,
    };
}

export async function getEpisodeChanges(
    episodeId: number | undefined,
    startDate: string,
    request: typeof fetch = fetch
) {
    const token = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
    if (!token || !episodeId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return null;
    }

    const end = new Date(Date.now() + 86_400_000);
    const earliest = new Date(end.getTime() - 14 * 86_400_000);
    const requestedStart = new Date(`${startDate}T00:00:00Z`);
    const start = requestedStart > earliest && requestedStart < end ? requestedStart : earliest;
    const query = new URLSearchParams({
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
    });
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

    return changedEpisodeDetails(changesResponseSchema.parse(await response.json()));
}
