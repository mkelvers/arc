import type {
    ProviderAnime,
    ProviderEpisodeReference,
} from './types';

export function providerTitles(anime: ProviderAnime) {
    return [
        anime.title?.english,
        anime.title?.romaji,
        anime.title?.native,
        ...(anime.synonyms ?? []),
    ].filter(
        (title, index, values): title is string =>
            Boolean(title?.trim()) && values.indexOf(title) === index,
    );
}

export function isSpecialEpisodeReference(
    episode: ProviderEpisodeReference,
) {
    return episode.number <= 0 || !Number.isInteger(episode.number);
}

export function normalizedProviderTitle(title: string) {
    return title
        .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
        .normalize('NFKD')
        .replace(/\p{M}+/gu, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .toLocaleLowerCase('en');
}

export function episodeTitleKey(title: string) {
    return normalizedProviderTitle(title)
        .replace(/^episode \d+(?: \d+)?(?:\s+|$)/, '')
        .replace(/^(?:extra|special|ova|oad)\s+/, '')
        .replace(/^(?:a|an|the)\s+/, '')
        .trim();
}

export function episodeTitleScore(left: string, right: string) {
    const a = episodeTitleKey(left);
    const b = episodeTitleKey(right);

    if (!a || !b) {
        return 0;
    }

    if (a === b) {
        return 100;
    }

    if (
        Math.min(a.length, b.length) >= 5 &&
        (a.includes(b) || b.includes(a))
    ) {
        return 75;
    }
    const [shorter, longer] =
        a.length <= b.length ? [a, b] : [b, a];
    if (
        shorter.length >= 3 &&
        (longer.startsWith(shorter) || longer.endsWith(shorter))
    ) {
        return 75;
    }

    const insignificant = new Set([
        'a',
        'an',
        'and',
        'for',
        'in',
        'of',
        'on',
        'the',
        'to',
    ]);
    const significantWords = (value: string) =>
        value
            .split(' ')
            .filter((word) => !insignificant.has(word))
            .map((word) =>
                word.length >= 5 ? word.replace(/s$/, '') : word,
            );
    const leftWords = new Set(significantWords(a));
    const rightWords = new Set(significantWords(b));
    if (!leftWords.size || !rightWords.size) {
        return -30;
    }
    const shared = [...leftWords].filter((word) =>
        rightWords.has(word),
    ).length;
    const similarity =
        (2 * shared) / (leftWords.size + rightWords.size);

    if (similarity >= 0.75) {
        return 60;
    }
    if (similarity >= 0.5) {
        return 35;
    }
    if (similarity >= 0.3) {
        return 15;
    }

    return -30;
}

const releaseTitleStopWords = new Set([
    'a',
    'an',
    'as',
    'cour',
    'digression',
    'episode',
    'episodes',
    'full',
    'i',
    'in',
    'journal',
    'memories',
    'movie',
    'of',
    'oad',
    'ona',
    'ova',
    'part',
    'recap',
    'season',
    'special',
    'tales',
    'the',
    'to',
    'tv',
]);

function releaseTitleWords(title: string) {
    return new Set(
        normalizedProviderTitle(title)
            .split(' ')
            .filter(
                (word) =>
                    word.length > 1 &&
                    !/^\d+(?:st|nd|rd|th)?$/.test(word) &&
                    !releaseTitleStopWords.has(word),
            ),
    );
}

function relatedReleaseTitle(left: string, right: string) {
    const leftWords = releaseTitleWords(left);
    const rightWords = releaseTitleWords(right);
    if (!leftWords.size || !rightWords.size) {
        return false;
    }

    const shared = [...leftWords].filter((word) =>
        rightWords.has(word),
    );
    const smaller = Math.min(leftWords.size, rightWords.size);

    return (
        (shared.length >= 2 && shared.length / smaller >= 0.5) ||
        (smaller === 1 &&
            shared.length === 1 &&
            shared[0].length >= 5)
    );
}

function releaseSequence(title: string) {
    const normalized = normalizedProviderTitle(title);
    const season =
        normalized.match(/\bseason\s+0*(\d+)\b/)?.[1] ??
        normalized.match(
            /\b0*(\d+)(?:st|nd|rd|th)\s+season\b/,
        )?.[1] ??
        null;
    const part =
        normalized.match(/\b(?:cour|part)\s+0*(\d+)\b/)?.[1] ??
        null;

    return { season, part };
}

function relatedCollectionTitle(left: string, right: string) {
    if (!relatedReleaseTitle(left, right)) {
        return false;
    }

    const leftSequence = releaseSequence(left);
    const rightSequence = releaseSequence(right);
    return (
        (!leftSequence.season ||
            !rightSequence.season ||
            leftSequence.season === rightSequence.season) &&
        (!leftSequence.part ||
            !rightSequence.part ||
            leftSequence.part === rightSequence.part)
    );
}

export function standaloneSpecialMatches(
    anime: ProviderAnime,
    episode: ProviderEpisodeReference,
    candidateTitles: string[],
) {
    if (
        !isSpecialEpisodeReference(episode) ||
        !episode.title?.trim() ||
        releaseTitleWords(episode.title).size === 0
    ) {
        return false;
    }

    const titles = candidateTitles.filter(Boolean);
    return (
        titles.some(
            (title) =>
                episodeTitleScore(episode.title ?? '', title) >= 60,
        ) &&
        providerTitles(anime).some((animeTitle) =>
            titles.some((title) =>
                relatedCollectionTitle(animeTitle, title),
            ),
        )
    );
}

export function specialCollectionMatches(
    anime: ProviderAnime,
    episode: ProviderEpisodeReference,
    candidateTitles: string[],
    providerEpisodeCount?: number,
) {
    if (
        !isSpecialEpisodeReference(episode) ||
        !Number.isSafeInteger(episode.specialIndex) ||
        !Number.isSafeInteger(episode.specialCount) ||
        !episode.specialIndex ||
        !episode.specialCount ||
        episode.specialIndex < 1 ||
        episode.specialIndex > episode.specialCount ||
        (providerEpisodeCount !== undefined &&
            providerEpisodeCount !== episode.specialCount)
    ) {
        return false;
    }

    const titles = candidateTitles.filter(Boolean);
    return (
        titles.some((title) =>
            /\b(?:digressions?|extras?|oads?|onas?|ovas?|recaps?|specials?)\b/.test(
                normalizedProviderTitle(title),
            ),
        ) &&
        providerTitles(anime).some((animeTitle) =>
            titles.some((title) =>
                relatedCollectionTitle(animeTitle, title),
            ),
        )
    );
}

export function specialReleaseQueries(
    anime: ProviderAnime,
    episode: ProviderEpisodeReference,
) {
    if (
        !isSpecialEpisodeReference(episode) ||
        !episode.title?.trim() ||
        releaseTitleWords(episode.title).size === 0
    ) {
        return [];
    }

    const searchTitle = (title: string) =>
        title
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    const episodeTitle = searchTitle(episode.title);

    return [
        ...new Set([
            ...providerTitles(anime)
                .slice(0, 3)
                .map(
                    (title) =>
                        `${searchTitle(title)} ${episodeTitle}`,
                ),
            ...providerTitles(anime)
                .slice(0, 3)
                .map((title) => `${searchTitle(title)} specials`),
            episodeTitle,
        ]),
    ];
}

export function matchProviderEpisode<
    T extends { number: number; title: string },
>(
    episodes: T[],
    reference: ProviderEpisodeReference,
) {
    if (reference.title) {
        const ranked = episodes
            .map((episode) => ({
                episode,
                score: episodeTitleScore(
                    reference.title ?? '',
                    episode.title,
                ),
            }))
            .sort((left, right) => right.score - left.score);
        const [best, alternate] = ranked;
        const specialReference = isSpecialEpisodeReference(reference);

        if (
            best?.score >= 60 &&
            (!alternate || best.score > alternate.score) &&
            (!specialReference ||
                best.score === 100 ||
                best.episode.number === reference.number)
        ) {
            return best.episode;
        }
    }

    const numbered = episodes.find(
        (episode) => episode.number === reference.number,
    );
    if (
        reference.title &&
        numbered?.title &&
        episodeTitleKey(reference.title) &&
        episodeTitleKey(numbered.title) &&
        episodeTitleScore(reference.title, numbered.title) < 15
    ) {
        return undefined;
    }

    return numbered;
}

export function matchProviderStreamEpisode<
    T extends { number: number; title: string },
>(
    episodes: T[],
    reference: ProviderEpisodeReference,
    expectedEpisodes: number | null | undefined,
) {
    const match = matchProviderEpisode(episodes, reference);
    if (match) {
        return match;
    }

    const [only] = episodes;
    return expectedEpisodes === 1 &&
        reference.number === 1 &&
        episodes.length === 1 &&
        only.number === 1
        ? only
        : undefined;
}
