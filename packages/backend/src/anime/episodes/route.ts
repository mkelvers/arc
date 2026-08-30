export function watchEpisodeHref(anilistId: number, number: number) {
    return `/anime/${anilistId}/watch/${encodeURIComponent(String(number))}`;
}

export function watchEpisodeNumber(reference: string) {
    const normalized = reference.trim();
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
        return null;
    }

    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
}
