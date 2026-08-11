import { workerConfig } from '../config';

export async function syncAniList(userId: string) {
    const response = await fetch(`${workerConfig.webUrl}/api/internal/sync/anilist`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${workerConfig.workerToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
        signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? `; retry after ${retryAfter}s` : '';
        throw new Error(`AniList sync failed: ${response.status}${delay}`);
    }
}
