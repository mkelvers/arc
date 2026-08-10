import { workerConfig } from '../config';

export async function syncAniList(userId: string) {
  const response = await fetch(`${workerConfig.webUrl}/api/internal/sync/anilist`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${workerConfig.workerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    throw new Error(`AniList sync failed: ${response.status}`);
  }
}
