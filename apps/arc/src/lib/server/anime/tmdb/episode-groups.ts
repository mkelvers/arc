import type { AniListAnime } from '../anilist/types';
import { animeDate } from '../date';
import type { ProviderEpisode } from '../providers/types';
import { episodeTitleKey, episodeTitleScore, normalizedProviderTitle } from '../providers/match';
import { releaseSequence } from './title';
import type { EpisodeCandidate } from './types';

export interface EpisodeGroupBlock {
    episodes: Array<
        EpisodeCandidate & {
            order: number;
        }
    >;
    name?: string;
    order: number;
}

function orderedCandidates(block: EpisodeGroupBlock) {
    return block.episodes
        .toSorted(
            (left, right) =>
                left.order - right.order ||
                left.rawAirDate.localeCompare(right.rawAirDate) ||
                left.seasonNumber - right.seasonNumber ||
                left.episodeNumber - right.episodeNumber
        )
        .map(({ order, ...episode }, index) => {
            void order;
            return { ...episode, releaseEpisodeNumber: index + 1 };
        });
}

function titleEvidence(source: ProviderEpisode[], candidates: EpisodeCandidate[]) {
    let distinctive = 0;
    let matches = 0;

    source.forEach((episode, index) => {
        if (!episodeTitleKey(episode.title)) {
            return;
        }

        distinctive++;
        if (candidates[index] && episodeTitleScore(episode.title, candidates[index].title) >= 60) {
            matches++;
        }
    });

    return { distinctive, matches };
}

function metadataScore(candidates: EpisodeCandidate[]) {
    return candidates.reduce(
        (score, episode) =>
            score +
            Number(Boolean(episodeTitleKey(episode.title))) +
            Number(Boolean(episode.overview)) +
            Number(Boolean(episode.imageUrl)) +
            Number(Boolean(episode.runtime)),
        0
    );
}

function inventoryKey(candidates: EpisodeCandidate[]) {
    return candidates
        .map(({ seasonNumber, episodeNumber }) => `${seasonNumber}:${episodeNumber}`)
        .join(',');
}

/** Selects a TMDB episode-group block only when it identifies this release. */
export function releaseEpisodeGroup(
    anime: AniListAnime,
    source: ProviderEpisode[],
    blocks: EpisodeGroupBlock[]
) {
    const expectedCount = anime.episodes ?? null;
    const expectedStart = animeDate(anime.startDate);
    const expectedSequence = releaseSequence(anime);
    const matches = blocks.flatMap((block) => {
        const candidates = orderedCandidates(block);
        if (!candidates.length || (expectedCount && candidates.length !== expectedCount)) {
            return [];
        }

        const actualStart = candidates
            .map(({ rawAirDate }) => rawAirDate)
            .filter(Boolean)
            .sort()[0];
        const dateMatch = Boolean(expectedStart && actualStart === expectedStart);
        const seasonMatch = Boolean(
            expectedSequence &&
            normalizedProviderTitle(block.name ?? '') === `season ${expectedSequence}`
        );
        const titles = titleEvidence(source, candidates);
        const confident = expectedCount
            ? dateMatch || seasonMatch || (titles.distinctive >= 2 && titles.matches >= 2)
            : dateMatch && (source.length === candidates.length || titles.matches > 0);

        return confident
            ? [
                  {
                      candidates,
                      key: inventoryKey(candidates),
                      identityScore:
                          Number(dateMatch) * 1_000 +
                          Number(expectedCount !== null) * 100 +
                          Number(seasonMatch) * 50 +
                          titles.matches * 200,
                      metadataScore: metadataScore(candidates),
                  },
              ]
            : [];
    });
    const ranked = matches.toSorted(
        (left, right) =>
            right.identityScore - left.identityScore || right.metadataScore - left.metadataScore
    );
    const [best, alternate] = ranked;

    if (
        !best ||
        (alternate && alternate.identityScore === best.identityScore && alternate.key !== best.key)
    ) {
        return null;
    }

    return best.candidates;
}
