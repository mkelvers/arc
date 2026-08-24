import { getAnimeRelease, refreshAnimeRelease } from './releases';

export const getAnime = getAnimeRelease;
export const refreshAnime = (id: number) => refreshAnimeRelease(id, { force: true });
