export interface RelatedAnime {
    id: number;
    status: string | null;
    type: string | null;
    relations: Array<{ id: number; type: string | null }>;
}

interface ResolvedNotificationInterest {
    anilistId: number;
    sourceAnilistId: number;
}

export async function resolveNotificationInterests(
    seedIds: Iterable<number>,
    loadAnime: (ids: number[]) => Promise<RelatedAnime[]>
) {
    const roots = [...new Set(seedIds)].sort((left, right) => left - right);
    const pending = new Set(roots);
    const visited = new Set<number>();
    const mediaById = new Map<number, RelatedAnime>();

    while (pending.size) {
        const ids = [...pending].filter((id) => !visited.has(id));
        pending.clear();

        for (let offset = 0; offset < ids.length; offset += 50) {
            for (const anime of await loadAnime(ids.slice(offset, offset + 50))) {
                if (visited.has(anime.id)) {
                    continue;
                }

                visited.add(anime.id);
                if (anime.type !== 'ANIME') {
                    continue;
                }

                mediaById.set(anime.id, anime);
                for (const relation of anime.relations) {
                    if (relation.type === 'SEQUEL' && !visited.has(relation.id)) {
                        pending.add(relation.id);
                    }
                }
            }
        }
    }

    const sourceById = new Map<number, number>();
    const queue = roots.map((anilistId) => ({ anilistId, sourceAnilistId: anilistId }));
    for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index];
        const media = mediaById.get(current.anilistId);
        const previousSource = sourceById.get(current.anilistId);
        if (!media || (previousSource !== undefined && previousSource <= current.sourceAnilistId)) {
            continue;
        }

        sourceById.set(current.anilistId, current.sourceAnilistId);
        for (const relation of media.relations) {
            if (relation.type === 'SEQUEL') {
                queue.push({
                    anilistId: relation.id,
                    sourceAnilistId: current.sourceAnilistId,
                });
            }
        }
    }

    return [...mediaById.keys()]
        .sort((left, right) => left - right)
        .map((anilistId): ResolvedNotificationInterest => ({
            anilistId,
            sourceAnilistId: sourceById.get(anilistId) ?? anilistId,
        }));
}
