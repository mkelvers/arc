import { env } from '$env/dynamic/private';

interface ChangeItem {
    iso_639_1?: unknown;
    iso_3166_1?: unknown;
    value?: unknown;
}

interface Change {
    key?: unknown;
    items?: unknown;
}

interface ChangesResponse {
    changes?: unknown;
}

function isChange(value: unknown): value is Change {
    return typeof value === 'object' && value !== null;
}

function isChangeItem(value: unknown): value is ChangeItem {
    return typeof value === 'object' && value !== null;
}

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

    const payload = (await response.json()) as ChangesResponse;
    const overviewChanges = Array.isArray(payload.changes)
        ? payload.changes
              .filter(isChange)
              .filter((change) => change.key === 'overview')
              .flatMap((change) => (Array.isArray(change.items) ? change.items : []))
              .filter(isChangeItem)
        : [];
    const overview = overviewChanges
        .toReversed()
        .find(
            (item) =>
                item.iso_639_1 === 'en' &&
                item.iso_3166_1 === 'US' &&
                typeof item.value === 'string' &&
                item.value.trim()
        );

    return typeof overview?.value === 'string' ? overview.value.trim() : null;
}
