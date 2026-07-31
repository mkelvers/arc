import type { EpisodeCandidate } from './types';

export interface EpisodeDetail {
    name?: string | null;
    overview?: string | null;
    runtime?: number | null;
    stillPath?: string | null;
}

export interface EpisodeTranslation {
    country?: string;
    language?: string;
    name?: string | null;
    overview?: string | null;
}

export interface EpisodeStill {
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

export function translatedMetadata(
    translations: EpisodeTranslation[] | undefined,
    originalLanguage?: string,
) {
    const english =
        translations?.find(
            (translation) =>
                translation.language === 'en' &&
                translation.country === 'US' &&
                (text(translation.name) ||
                    text(translation.overview)),
        ) ??
        translations?.find(
            (translation) =>
                translation.language === 'en' &&
                (text(translation.name) ||
                    text(translation.overview)),
        );
    const fallbackTranslations = translations
        ?.filter(
            (translation) =>
                translation !== english &&
                (text(translation.name) ||
                    text(translation.overview)),
        )
        .toSorted(
            (left, right) =>
                Number(right.language === originalLanguage) -
                Number(left.language === originalLanguage),
        );
    const preferred = [english, ...(fallbackTranslations ?? [])];

    return {
        name: preferred
            .map((translation) => translation?.name)
            .find((value) => !genericTitle(value)),
        overview: preferred
            .map((translation) => text(translation?.overview))
            .find(Boolean),
    };
}

export function episodeDetailsNeeded(candidate: EpisodeCandidate) {
    return {
        details:
            genericTitle(candidate.title) ||
            !candidate.overview ||
            !candidate.runtime ||
            !candidate.imageUrl,
        translations:
            genericTitle(candidate.title) || !candidate.overview,
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
        originalLanguage,
        image,
    }: {
        details?: EpisodeDetail;
        translations?: EpisodeTranslation[];
        stills?: EpisodeStill[];
        featured?: EpisodeDetail;
        originalLanguage?: string;
        image: (path: string) => string;
    },
): EpisodeCandidate {
    const translated = translatedMetadata(
        translations,
        originalLanguage,
    );
    const title = genericTitle(candidate.title)
        ? [
              translated.name,
              details?.name,
              featured?.name,
              candidate.title,
          ].find((value) => !genericTitle(value)) ?? candidate.title
        : candidate.title;
    const bestStill = stills
        ?.filter(
            (still): still is EpisodeStill & { filePath: string } =>
                Boolean(still.filePath),
        )
        .toSorted(
            (left, right) =>
                right.voteAverage - left.voteAverage ||
                right.voteCount - left.voteCount ||
                right.width - left.width,
        )[0]?.filePath;
    const stillPath =
        details?.stillPath || featured?.stillPath || bestStill;

    return {
        ...candidate,
        title,
        overview:
            text(candidate.overview) ||
            text(details?.overview) ||
            translated.overview ||
            text(featured?.overview),
        runtime:
            candidate.runtime ||
            details?.runtime ||
            featured?.runtime ||
            null,
        imageUrl:
            candidate.imageUrl ||
            (stillPath ? image(stillPath) : null),
    };
}
