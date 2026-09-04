import { canPreserveEpisodeMetadata, episodeMetadataRevision } from './episode-policy';
import { preferredEpisodeAirDate } from './episode-release';

export interface EpisodeMetadata {
    title: string | null;
    titleSource: 'tmdb' | 'machine' | null;
    imageUrl: string | null;
    runtime: number | null;
    airDate: string | null;
    overview: string | null;
    overviewSource: 'tmdb' | 'machine' | null;
}

export interface EpisodeMetadataRow {
    episodeId: string;
    number: number;
    metadataTitle: string | null;
    metadataTitleSource: 'tmdb' | 'machine' | null;
    imageUrl: string | null;
    runtimeMinutes: number | null;
    airDate: string | null;
    overview: string | null;
    overviewSource: 'tmdb' | 'machine' | null;
}

export function reconcileEpisodeMetadata(
    episodes: readonly EpisodeMetadataRow[],
    metadata: ReadonlyMap<string, EpisodeMetadata> | null,
    options: {
        previousSourceId: number | null;
        currentSourceId: number | null;
        previousRevision: string | null;
        confirmedAirDates?: ReadonlyMap<number, Date>;
    }
) {
    const preserve =
        canPreserveEpisodeMetadata(options.previousSourceId, options.currentSourceId) &&
        (metadata === null || options.previousRevision === episodeMetadataRevision);

    return episodes.map((episode) => {
        const current = metadata?.get(episode.episodeId);
        const previous = preserve ? episode : null;
        const airDate = current?.airDate || previous?.airDate || null;

        return {
            episodeId: episode.episodeId,
            metadataTitle: current?.title ?? previous?.metadataTitle ?? null,
            metadataTitleSource: current?.titleSource ?? previous?.metadataTitleSource ?? null,
            imageUrl: current?.imageUrl ?? previous?.imageUrl ?? null,
            runtimeMinutes: current?.runtime ?? previous?.runtimeMinutes ?? null,
            airDate: preferredEpisodeAirDate(
                episode.number,
                airDate,
                options.confirmedAirDates?.get(episode.number)
            ),
            overview: current?.overview ?? previous?.overview ?? null,
            overviewSource: current?.overviewSource ?? previous?.overviewSource ?? null,
        };
    });
}
