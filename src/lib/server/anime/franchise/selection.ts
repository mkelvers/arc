import type {
    MediaFormat,
    MediaRelation,
} from '$lib/graphql/anilist/generated/graphql';

export type FranchiseSelectionEntry = {
    malId: number;
    title: string;
    format: MediaFormat | null;
    episodes: number | null;
    duration: number | null;
    popularity: number | null;
    secondary: boolean;
    relations: Array<{
        type: MediaRelation;
        malId: number;
    }>;
};

const continuityRelations = new Set<MediaRelation>([
    'PREQUEL',
    'SEQUEL',
]);
const replacementRelations = new Set<MediaRelation>([
    'ALTERNATIVE',
    'COMPILATION',
    'CONTAINS',
    'SUMMARY',
]);

const formatWeight: Partial<Record<MediaFormat, number>> = {
    TV: 100_000,
    MOVIE: 60_000,
    ONA: 30_000,
    OVA: 30_000,
    SPECIAL: 15_000,
    TV_SHORT: 10_000,
};

function totalRuntime(entry: FranchiseSelectionEntry) {
    return (entry.episodes ?? 1) * (entry.duration ?? 0);
}

function entryWeight(entry: FranchiseSelectionEntry) {
    const weight =
        (entry.popularity ?? 0) +
        (formatWeight[entry.format ?? 'MUSIC'] ?? 0) +
        Math.min(totalRuntime(entry), 2_000) * 10;

    return entry.secondary ? weight / 4 : weight;
}

function continuityComponents(entries: FranchiseSelectionEntry[]) {
    const ids = new Set(entries.map(({ malId }) => malId));
    const adjacent = new Map<number, Set<number>>(
        entries.map(({ malId }) => [malId, new Set()]),
    );

    for (const entry of entries) {
        for (const relation of entry.relations) {
            if (
                ids.has(relation.malId) &&
                continuityRelations.has(relation.type)
            ) {
                adjacent.get(entry.malId)?.add(relation.malId);
                adjacent.get(relation.malId)?.add(entry.malId);
            }
        }
    }

    const components: number[][] = [];
    const visited = new Set<number>();

    for (const entry of entries) {
        if (visited.has(entry.malId)) {
            continue;
        }

        const component: number[] = [];
        const pending = [entry.malId];
        visited.add(entry.malId);

        while (pending.length) {
            const malId = pending.pop();
            if (!malId) {
                continue;
            }

            component.push(malId);
            for (const relatedId of adjacent.get(malId) ?? []) {
                if (!visited.has(relatedId)) {
                    visited.add(relatedId);
                    pending.push(relatedId);
                }
            }
        }

        components.push(component);
    }

    return components;
}

function isSeasonContinuation(entry: FranchiseSelectionEntry) {
    return (
        entry.format === 'TV' &&
        !entry.secondary &&
        /\b(?:(?:\d+(?:st|nd|rd|th)|final)\s+season|season\s+\d+|part\s+\d+|cour\s+\d+)\b/i.test(
            entry.title,
        )
    );
}

function hasRelationBetween(
    leftIds: Set<number>,
    rightId: number,
    entries: FranchiseSelectionEntry[],
    relationTypes?: Set<MediaRelation>,
) {
    return entries.some((entry) => {
        if (entry.malId === rightId) {
            return entry.relations.some(
                (relation) =>
                    leftIds.has(relation.malId) &&
                    (!relationTypes || relationTypes.has(relation.type)),
            );
        }

        return (
            leftIds.has(entry.malId) &&
            entry.relations.some(
                (relation) =>
                    relation.malId === rightId &&
                    (!relationTypes || relationTypes.has(relation.type)),
            )
        );
    });
}

function isNarrativeMovie(
    entry: FranchiseSelectionEntry,
    primaryIds: Set<number>,
    entries: FranchiseSelectionEntry[],
) {
    return (
        entry.format === 'MOVIE' &&
        !entry.secondary &&
        totalRuntime(entry) >= 40 &&
        hasRelationBetween(primaryIds, entry.malId, entries) &&
        !hasRelationBetween(
            primaryIds,
            entry.malId,
            entries,
            replacementRelations,
        )
    );
}

export function primaryFranchiseIds(entries: FranchiseSelectionEntry[]) {
    if (!entries.length) {
        return new Set<number>();
    }

    const byId = new Map(entries.map((entry) => [entry.malId, entry]));
    const components = continuityComponents(entries);
    const primaryComponent = components.toSorted((left, right) => {
        const score = (component: number[]) =>
            component.reduce(
                (total, malId) => total + entryWeight(byId.get(malId)!),
                0,
            );

        return score(right) - score(left) || right.length - left.length;
    })[0];
    const primaryIds = new Set(primaryComponent);

    for (const entry of entries) {
        if (
            isSeasonContinuation(entry) ||
            isNarrativeMovie(entry, primaryIds, entries)
        ) {
            primaryIds.add(entry.malId);
        }
    }

    return primaryIds;
}
