import { DiscoveryAnimeDocument } from '@arc/shared/anilist/generated/graphql';
import { isDiscoverableAnime } from '../discovery';
import { request } from './client';
import { present } from './text';

export async function discoverableAnimeIds(ids: number[]) {
    if (!ids.length) {
        return new Set<number>();
    }

    const response = await request(
        DiscoveryAnimeDocument,
        { ids: [...new Set(ids)] },
        { cacheForMs: 24 * 60 * 60 * 1_000 }
    );

    return new Set(
        present(response.Page?.media)
            .filter(isDiscoverableAnime)
            .map(({ id }) => id)
    );
}
