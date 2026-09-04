import type { AniListAnime } from '../anilist-types';

export const minimumInformativeHeroSynopsisLength = 160;

export function isSeasonPlaceholderSynopsis(value: string) {
    return /^(?:(?:the\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\d+(?:st|nd|rd|th))\s+season|season\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\d+(?:st|nd|rd|th)))\s+of\b/i.test(
        value.trim()
    );
}

export function isSeasonReleaseTitle(value: string) {
    return /\b(?:season\s+(?:\d+|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)|(?:\d+|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?:st|nd|rd|th)?\s+season)\b/i.test(
        value
    );
}

function synopsisSentences(value: string) {
    const text = value.replace(/\s+\*(?:This includes|Includes):?[\s\S]*$/i, '').trim();
    const sentences: string[] = [];
    for (const part of text.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
        const previous = sentences.at(-1);
        if (previous && /\b[A-Z]\.$/.test(previous)) {
            sentences[sentences.length - 1] = `${previous} ${part}`;
        } else {
            sentences.push(part);
        }
    }

    return sentences;
}

export function conciseHeroSynopsis(value: string) {
    const sentences = synopsisSentences(value);
    const summary = sentences.slice(0, 2).join(' ');
    if (summary.length <= 320) {
        return summary;
    }

    const fragment = summary.slice(0, 320);
    const sentenceEnd = [...fragment.matchAll(/[.!?](?=\s|$)/g)].at(-1);
    if (sentenceEnd && sentenceEnd.index !== undefined && sentenceEnd.index >= 180) {
        return fragment.slice(0, sentenceEnd.index + 1);
    }

    const wordEnd = fragment.lastIndexOf(' ');
    return `${fragment.slice(0, wordEnd > 0 ? wordEnd : 320).trimEnd()}…`;
}

export function informativeHeroSynopsis(preferred: string, fallback: string) {
    const preferredSentences = synopsisSentences(preferred);
    const preferredSummary = conciseHeroSynopsis(preferred);
    const fallbackSummary = conciseHeroSynopsis(fallback);

    // Do not let a technically valid one-line premise displace a fuller story summary.
    if (
        preferredSummary &&
        preferredSummary.length >= minimumInformativeHeroSynopsisLength &&
        preferredSummary.length * 3 >= fallback.trim().length * 2
    ) {
        return preferredSummary;
    }

    if (
        preferredSentences.length === 1 &&
        preferredSummary.length < minimumInformativeHeroSynopsisLength &&
        fallbackSummary.length >= minimumInformativeHeroSynopsisLength
    ) {
        return fallbackSummary;
    }

    const fallbackSentences = synopsisSentences(fallback);
    const consequence = fallbackSentences.length > 1 ? fallbackSentences.at(-1) : null;
    const enriched = consequence ? `${preferredSummary} ${consequence}` : '';

    return enriched && enriched.length <= 320 ? enriched : fallbackSummary || preferredSummary;
}

function releaseDate(anime: AniListAnime) {
    const year = anime.startDate?.year;
    if (!year) {
        return Number.MAX_SAFE_INTEGER;
    }

    return year * 10_000 + (anime.startDate?.month ?? 0) * 100 + (anime.startDate?.day ?? 0);
}

export function earliestRelease(anime: AniListAnime[]) {
    return anime.toSorted(
        (left, right) => releaseDate(left) - releaseDate(right) || left.id - right.id
    )[0];
}
