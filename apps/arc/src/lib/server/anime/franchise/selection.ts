import type {
    MediaFormat,
    MediaRelation,
    MediaStatus,
} from '$lib/graphql/anilist/generated/graphql';

export type FranchiseSelectionEntry = {
    malId: number;
    title: string;
    format: MediaFormat | null;
    status: MediaStatus | null;
    episodes: number | null;
    duration: number | null;
    popularity: number | null;
    secondary: boolean;
    relations: Array<{
        type: MediaRelation;
        malId: number;
    }>;
};

export function isFranchiseEntryEligible(
    entry: Pick<FranchiseSelectionEntry, 'status' | 'format'>
) {
    return entry.status !== 'NOT_YET_RELEASED' && entry.format !== 'MUSIC';
}

const continuityRelations = new Set<MediaRelation>(['PREQUEL', 'SEQUEL']);
const replacementRelations = new Set<MediaRelation>([
    'ALTERNATIVE',
    'COMPILATION',
    'CONTAINS',
    'SUMMARY',
    'SIDE_STORY',
    'SPIN_OFF',
]);

const formatWeight = new Map<MediaFormat, number>([
    ['TV', 100_000],
    ['MOVIE', 60_000],
    ['ONA', 30_000],
    ['OVA', 30_000],
    ['SPECIAL', 15_000],
    ['TV_SHORT', 10_000],
]);

function totalRuntime(entry: FranchiseSelectionEntry) {
    return (entry.episodes ?? 1) * (entry.duration ?? 0);
}

function entryWeight(entry: FranchiseSelectionEntry) {
    const weight =
        (entry.popularity ?? 0) +
        (formatWeight.get(entry.format ?? 'MUSIC') ?? 0) +
        Math.min(totalRuntime(entry), 2_000) * 10;

    return entry.secondary ? weight / 4 : weight;
}

function continuityComponents(
    entries: FranchiseSelectionEntry[],
    includedIds = new Set(entries.map(({ malId }) => malId))
) {
    const ids = new Set(entries.map(({ malId }) => malId));
    const adjacent = new Map<number, Set<number>>(entries.map(({ malId }) => [malId, new Set()]));

    for (const entry of entries) {
        for (const relation of entry.relations) {
            if (ids.has(relation.malId) && continuityRelations.has(relation.type)) {
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

            if (includedIds.has(malId)) {
                component.push(malId);
            }
            for (const relatedId of adjacent.get(malId) ?? []) {
                if (!visited.has(relatedId)) {
                    visited.add(relatedId);
                    pending.push(relatedId);
                }
            }
        }

        components.push(component);
    }

    return components.filter((component) => component.length);
}

function isSeasonContinuation(entry: FranchiseSelectionEntry) {
    return (
        entry.format === 'TV' &&
        !entry.secondary &&
        /\b(?:(?:\d+(?:st|nd|rd|th)|final)\s+season|season\s+\d+|part\s+\d+|cour\s+\d+)\b/i.test(
            entry.title
        )
    );
}

function isBranchContinuation(
    entry: FranchiseSelectionEntry,
    primaryIds: Set<number>,
    entries: FranchiseSelectionEntry[]
) {
    return entry.relations.some((relation) => {
        if (relation.type !== 'PREQUEL') {
            return false;
        }

        const predecessor = entries.find(({ malId }) => malId === relation.malId);
        return predecessor?.relations.some(
            (parent) =>
                primaryIds.has(parent.malId) &&
                (parent.type === 'PARENT' ||
                    parent.type === 'SIDE_STORY' ||
                    parent.type === 'SPIN_OFF')
        );
    });
}

function hasRelationBetween(
    leftIds: Set<number>,
    rightId: number,
    entries: FranchiseSelectionEntry[],
    relationTypes?: Set<MediaRelation>
) {
    return entries.some((entry) => {
        if (entry.malId === rightId) {
            return entry.relations.some(
                (relation) =>
                    leftIds.has(relation.malId) &&
                    (!relationTypes || relationTypes.has(relation.type))
            );
        }

        return (
            leftIds.has(entry.malId) &&
            entry.relations.some(
                (relation) =>
                    relation.malId === rightId &&
                    (!relationTypes || relationTypes.has(relation.type))
            )
        );
    });
}

function isNarrativeMovie(
    entry: FranchiseSelectionEntry,
    primaryIds: Set<number>,
    entries: FranchiseSelectionEntry[]
) {
    return (
        entry.format === 'MOVIE' &&
        !entry.secondary &&
        totalRuntime(entry) >= 40 &&
        hasRelationBetween(primaryIds, entry.malId, entries, continuityRelations) &&
        !hasRelationBetween(primaryIds, entry.malId, entries, replacementRelations)
    );
}

function isReplacementEntry(
    entry: FranchiseSelectionEntry,
    entries: FranchiseSelectionEntry[],
    entryIds: Set<number>
) {
    return (
        entry.format === 'MOVIE' &&
        (entries.some((candidate) =>
            candidate.relations.some(
                (relation) =>
                    relation.malId === entry.malId && replacementRelations.has(relation.type)
            )
        ) ||
            entry.relations.some(
                (relation) =>
                    entryIds.has(relation.malId) && replacementRelations.has(relation.type)
            ))
    );
}

function isContinuityEntry(entry: FranchiseSelectionEntry) {
    if (entry.format === 'OVA' || entry.format === 'ONA') {
        return false;
    }

    return entry.format !== 'SPECIAL' && entry.format !== 'TV_SHORT';
}

export function primaryFranchiseIds(entries: FranchiseSelectionEntry[]) {
    if (!entries.length) {
        return new Set<number>();
    }

    const entryIds = new Set(entries.map(({ malId }) => malId));
    const continuityGraphEntries = entries.filter(
        (entry) => !isReplacementEntry(entry, entries, entryIds)
    );
    const continuityEntries = continuityGraphEntries.filter((entry) => isContinuityEntry(entry));
    const components = continuityComponents(
        continuityGraphEntries,
        new Set(continuityEntries.map(({ malId }) => malId))
    );
    const byId = new Map(continuityEntries.map((entry) => [entry.malId, entry]));
    const primaryComponent = components.toSorted((left, right) => {
        const score = (component: number[]) =>
            component.reduce((total, malId) => {
                const entry = byId.get(malId);
                if (!entry) {
                    throw new Error(`Franchise component contains unknown MAL ID ${malId}`);
                }

                return total + entryWeight(entry);
            }, 0);

        return score(right) - score(left) || right.length - left.length;
    })[0];
    const primaryIds = new Set(primaryComponent);

    for (const entry of entries) {
        if (
            (isSeasonContinuation(entry) && !isBranchContinuation(entry, primaryIds, entries)) ||
            isNarrativeMovie(entry, primaryIds, entries)
        ) {
            primaryIds.add(entry.malId);
        }
    }

    return primaryIds;
}
