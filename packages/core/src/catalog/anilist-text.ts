function firstNonBlank(values: ReadonlyArray<string | null | undefined>) {
    return values.find((value) => Boolean(value?.trim())) ?? null;
}

const htmlEntities = {
    amp: '&',
    apos: "'",
    bull: '•',
    copy: '©',
    divide: '÷',
    gt: '>',
    hellip: '…',
    laquo: '«',
    ldquo: '“',
    lt: '<',
    lsquo: '‘',
    mdash: '—',
    nbsp: ' ',
    ndash: '–',
    quot: '"',
    raquo: '»',
    rdquo: '”',
    reg: '®',
    rsquo: '’',
    times: '×',
    trade: '™',
} as const;

export function decodeHtmlEntities(value: string) {
    return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (entity, decimal, hex, name) => {
        if (name) {
            return htmlEntities[name.toLowerCase() as keyof typeof htmlEntities] ?? entity;
        }

        const codePoint = Number.parseInt(decimal ?? hex, decimal ? 10 : 16);
        return Number.isSafeInteger(codePoint) ? String.fromCodePoint(codePoint) : entity;
    });
}

export function mediaTitle(media: {
    id: number;
    title?: {
        english?: string | null;
        romaji?: string | null;
        native?: string | null;
    } | null;
}) {
    return (
        firstNonBlank([media.title?.english, media.title?.romaji, media.title?.native]) ??
        `Anime ${media.id}`
    );
}

export function animeTitles(anime: {
    title?: {
        english?: string | null;
        romaji?: string | null;
        native?: string | null;
    } | null;
    synonyms?: ReadonlyArray<string | null> | null;
}) {
    return [
        anime.title?.english,
        anime.title?.romaji,
        anime.title?.native,
        ...(anime.synonyms ?? []),
    ].filter(
        (title, index, values): title is string =>
            Boolean(title?.trim()) && values.indexOf(title) === index
    );
}

export function plainText(value: string | null | undefined) {
    if (!value) {
        return '';
    }

    return decodeHtmlEntities(value.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))
        .replace(/\s*\(Source:[\s\S]*$/i, '')
        .replace(/\s*Note:[\s\S]*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}
