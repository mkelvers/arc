import { episodeTitleScore } from '../providers/match';
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
    const all = translations ?? [];

    return {
        name: english.map((translation) => translation?.name).find((value) => !genericTitle(value)),
        overview: english.map((translation) => text(translation?.overview)).find(Boolean),
        fallbackName: all
            .map((translation) => translation?.name)
            .find((value) => !genericTitle(value)),
        fallbackOverview: all.map((translation) => text(translation?.overview)).find(Boolean),
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
        localizedText = false,
        image,
    }: {
        details?: EpisodeDetail;
        translations?: EpisodeTranslation[];
        stills?: EpisodeStill[];
        featured?: EpisodeDetail;
        localizedText?: boolean;
        image: (path: string) => string;
    }
): EpisodeCandidate {
    const translated = translatedMetadata(translations);
    const title = localizedText
        ? genericTitle(candidate.title)
            ? ([translated.name, details?.name, featured?.name, translated.fallbackName].find(
                  (value) => !genericTitle(value)
              ) ?? '')
            : candidate.title
        : ([translated.name, details?.name, candidate.title, translated.fallbackName].find(
              (value) => !genericTitle(value)
          ) ?? '');
    const titleSource = title ? 'tmdb' : null;
    const overview = localizedText
        ? text(candidate.overview) ||
          text(details?.overview) ||
          translated.overview ||
          text(featured?.overview) ||
          translated.fallbackOverview ||
          ''
        : translated.overview ||
          text(details?.overview) ||
          text(candidate.overview) ||
          translated.fallbackOverview ||
          '';
    const bestStill = stills
        ?.filter((still): still is EpisodeStill & { filePath: string } => Boolean(still.filePath))
        .toSorted(
            (left, right) =>
                right.voteAverage - left.voteAverage ||
                right.voteCount - left.voteCount ||
                right.width - left.width
        )[0]?.filePath;
    const stillPath = details?.stillPath || featured?.stillPath || bestStill;

    return {
        ...candidate,
        title,
        titleSource,
        overview,
        overviewSource: overview ? 'tmdb' : null,
        runtime: candidate.runtime || details?.runtime || featured?.runtime || null,
        imageUrl: candidate.imageUrl || (stillPath ? image(stillPath) : null),
    };
}
