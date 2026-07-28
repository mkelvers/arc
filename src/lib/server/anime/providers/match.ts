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
        const specialReference =
            reference.number <= 0 ||
            !Number.isInteger(reference.number);

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
