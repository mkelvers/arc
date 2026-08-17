const franchiseRelations = new Set(['PREQUEL', 'SEQUEL']);

interface PopularAnime {
    id: number;
    relations?: {
        edges?: Array<{
            relationType?: string | null;
            node?: { id: number } | null;
        } | null> | null;
    } | null;
}

export function selectPopularAnime<Anime extends PopularAnime>(media: Array<Anime | null>) {
    const anime = media.filter((entry): entry is Anime => entry !== null);
    const parent = new Map(anime.map(({ id }) => [id, id]));

    function root(id: number): number {
        const next = parent.get(id);
        if (next == null || next === id) {
            return id;
        }

        const result = root(next);
        parent.set(id, result);
        return result;
    }

    function union(left: number, right: number) {
        const leftRoot = root(left);
        const rightRoot = root(right);
        if (leftRoot !== rightRoot) {
            parent.set(rightRoot, leftRoot);
        }
    }

    for (const entry of anime) {
        for (const relation of entry.relations?.edges ?? []) {
            if (
                relation?.node &&
                relation.relationType &&
                franchiseRelations.has(relation.relationType) &&
                parent.has(relation.node.id)
            ) {
                union(entry.id, relation.node.id);
            }
        }
    }

    const selected: Anime[] = [];
    const seen = new Set<number>();

    for (const entry of anime) {
        const franchise = root(entry.id);
        if (seen.has(franchise)) {
            continue;
        }

        seen.add(franchise);
        selected.push(entry);
        if (selected.length === 30) {
            break;
        }
    }

    return selected;
}
