export function present<T>(values: ReadonlyArray<T | null> | null | undefined): T[] {
    return values?.filter((value): value is T => value !== null) ?? [];
}

export function enumLabel(value: string | null | undefined, fallback = 'Unknown') {
    if (!value) {
        return fallback;
    }

    if (value === 'TV' || value === 'OVA' || value === 'ONA') {
        return value;
    }

    return value
        .toLowerCase()
        .replaceAll('_', ' ')
        .replace(/^./, (character) => character.toUpperCase());
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
        media.title?.english ?? media.title?.romaji ?? media.title?.native ?? `Anime ${media.id}`
    );
}

export function plainText(value: string | null | undefined) {
    if (!value) {
        return '';
    }

    return (
        value
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]+>/g, '')
            // remove trailing Source or Note blocks like "(Source: ...)" or bare "Note: ..."
            .replace(/\s*\(Source:[\s\S]*$/i, '')
            .replace(/\s*Note:[\s\S]*$/i, '')
            .replace(/\s+/g, ' ')
            .trim()
    );
}
