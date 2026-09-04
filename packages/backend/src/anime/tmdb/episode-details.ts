import { episodeTitleScore } from '@arc/core';
import type { EpisodeCandidate } from './types';

interface EpisodeDetail {
    name?: string | null;
    overview?: string | null;
    runtime?: number | null;
    stillPath?: string | null;
}

interface EpisodeTranslation {
    country?: string;
    language?: string;
    name?: string | null;
    overview?: string | null;
}

interface EpisodeStill {
    filePath?: string | null;
    voteAverage: number;
    voteCount: number;
    width: number;
}

function genericTitle(value: string | null | undefined) {
    return !value?.trim() || /^(?:episode|movie)(?:\s+\d+)?$/i.test(value);
}

function text(value: string | null | undefined) {
    return value?.trim() ?? '';
}

export function hasRequestedEpisodeLocalization(
    sourceTitle: string,
    candidateTitle: string,
    originalLanguage?: string
) {
    return originalLanguage === 'en' || episodeTitleScore(sourceTitle, candidateTitle) >= 15;
}

export function translatedMetadata(translations: EpisodeTranslation[] | undefined) {
    const english = (translations ?? [])
        .filter((translation) => translation.language === 'en')
        .toSorted((left, right) => Number(right.country === 'US') - Number(left.country === 'US'));

    return {
        name: english.map((translation) => translation?.name).find((value) => !genericTitle(value)),
        overview: english.map((translation) => text(translation?.overview)).find(Boolean),
    };
}

export function episodeDetailsNeeded(candidate: EpisodeCandidate, localizedText = false) {
    return {
        details:
            (localizedText && (genericTitle(candidate.title) || !candidate.overview)) ||
            !candidate.runtime ||
            !candidate.imageUrl,
        translations: !localizedText || genericTitle(candidate.title) || !candidate.overview,
        images: !candidate.imageUrl,
    };
}

export function completeEpisodeDetails(
    candidate: EpisodeCandidate,
    {
        details,
        translations,
        stills,
        featured,
        changes,
        localizedText = false,
        image,
    }: {
        details?: EpisodeDetail;
        translations?: EpisodeTranslation[];
        stills?: EpisodeStill[];
        featured?: EpisodeDetail;
        changes?: EpisodeDetail;
        localizedText?: boolean;
        image: (path: string) => string;
    }
): EpisodeCandidate {
    const translated = translatedMetadata(translations);
    const title = localizedText
        ? genericTitle(candidate.title)
            ? ([translated.name, details?.name, featured?.name, changes?.name].find(
                  (value) => !genericTitle(value)
              ) ?? '')
            : candidate.title
        : ([translated.name, details?.name, changes?.name, candidate.title].find(
              (value) => !genericTitle(value)
          ) ?? '');
    const titleSource = title ? 'tmdb' : null;
    const overview = localizedText
        ? text(candidate.overview) ||
          text(details?.overview) ||
          translated.overview ||
          text(featured?.overview) ||
          text(changes?.overview) ||
          ''
        : translated.overview ||
          text(details?.overview) ||
          text(changes?.overview) ||
          text(candidate.overview) ||
          '';
    const bestStill = stills
        ?.filter((still): still is EpisodeStill & { filePath: string } => Boolean(still.filePath))
        .toSorted(
            (left, right) =>
                right.voteAverage - left.voteAverage ||
                right.voteCount - left.voteCount ||
                right.width - left.width
        )[0]?.filePath;
    const stillPath = details?.stillPath || featured?.stillPath || bestStill || changes?.stillPath;

    return {
        ...candidate,
        title,
        titleSource,
        overview,
        overviewSource: overview ? 'tmdb' : null,
        runtime:
            candidate.runtime || details?.runtime || featured?.runtime || changes?.runtime || null,
        imageUrl: candidate.imageUrl || (stillPath ? image(stillPath) : null),
    };
}
