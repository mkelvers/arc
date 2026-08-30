export function genreSlug(genre: string) {
    return genre.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
}

export function genreFromSlug(genres: string[], slug: string) {
    return genres.find((genre) => genreSlug(genre) === slug) ?? null;
}
