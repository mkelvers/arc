export interface HomeHeroCandidate {
    anilistId: number;
    averageScore: number;
    trendingRank: number;
}

interface HomeHeroEligibility extends HomeHeroCandidate {
    popularity: number;
    favourites: number;
    seasonYear: number;
    genres: string[];
    hasPrequel: boolean;
}

export function homeHeroRotationStart(now = new Date()) {
    const rotation = new Date(
        Math.floor(now.getTime() / (3 * 24 * 60 * 60 * 1_000)) * (3 * 24 * 60 * 60 * 1_000)
    );

    return rotation.toISOString().slice(0, 10);
}

export function eligibleHomeHeroCandidates<Candidate extends HomeHeroEligibility>(
    candidates: Candidate[],
    now = new Date()
) {
    const currentYear = now.getUTCFullYear();

    return candidates
        .filter((candidate) => {
            // Continuing seasons need an established audience so a niche sequel cannot rank highly
            // only among existing fans. Favorites distinguish recommendations from list entries.
            return (
                candidate.seasonYear === currentYear &&
                candidate.averageScore > 70 &&
                candidate.trendingRank <= 30 &&
                candidate.popularity >= (candidate.hasPrequel ? 50_000 : 25_000) &&
                candidate.favourites * 1_000 >= candidate.popularity * 12 &&
                candidate.genres.some((genre) =>
                    ['Action', 'Adventure', 'Comedy', 'Drama', 'Romance'].includes(genre)
                )
            );
        })
        .toSorted((left, right) => left.trendingRank - right.trendingRank);
}

export function rotatedHomeHeroCandidates(
    candidates: HomeHeroCandidate[],
    previousIds: number[],
    recentIds: number[]
) {
    const byId = new Map(candidates.map((candidate) => [candidate.anilistId, candidate]));
    const previous = previousIds.flatMap((id) => {
        const candidate = byId.get(id);
        return candidate ? [candidate] : [];
    });
    const standouts = previous
        .filter(({ averageScore, trendingRank }) => averageScore >= 85 || trendingRank <= 10)
        .sort(
            (left, right) =>
                left.trendingRank - right.trendingRank || right.averageScore - left.averageScore
        )
        .slice(0, 2);
    const retained = standouts.length ? standouts : previous.slice(0, 1);
    const retainedIds = new Set(retained.map(({ anilistId }) => anilistId));
    const recentlyShown = new Set(recentIds);
    const fresh = candidates
        .filter(({ anilistId }) => !recentlyShown.has(anilistId))
        .toSorted((left, right) => left.trendingRank - right.trendingRank);
    const fallback = candidates.filter(
        ({ anilistId }) => !retainedIds.has(anilistId) && recentlyShown.has(anilistId)
    );

    return [...retained, ...fresh, ...fallback];
}

export async function selectHomeHero<T>(
    candidates: HomeHeroCandidate[],
    load: (id: number) => Promise<T | null>
) {
    const selected: T[] = [];

    for (let offset = 0; offset < candidates.length; offset += 6) {
        const hydrated = await Promise.all(
            candidates.slice(offset, offset + 6).map(({ anilistId }) => load(anilistId))
        );

        for (const candidate of hydrated) {
            if (candidate !== null) {
                selected.push(candidate);
            }
            if (selected.length === 6) {
                return selected;
            }
        }
    }

    return selected;
}
