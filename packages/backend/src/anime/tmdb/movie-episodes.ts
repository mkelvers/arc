import type { ProviderEpisode } from '../providers/types';
import type { EpisodeMetadata } from './types';

/** Shares release artwork without treating whole-movie text, dates, or runtime as episode facts. */
export function movieEpisodeMetadata(
    source: ProviderEpisode[],
    metadata: EpisodeMetadata
): Map<string, EpisodeMetadata> {
    const splitBroadcast = source.length > 1;

    return new Map(
        source.map((episode) => [
            episode.id,
            splitBroadcast
                ? {
                      ...metadata,
                      title: '',
                      titleSource: null,
                      overview: '',
                      overviewSource: null,
                      runtime: null,
                      airDate: '',
                  }
                : metadata,
        ])
    );
}
