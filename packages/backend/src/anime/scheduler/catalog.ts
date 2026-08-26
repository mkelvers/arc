import { currentAnimeSeason } from '@arc/shared/season';
import { getBrowseTaxonomy } from '../anilist/browse';
import { refreshHomeHeroCandidates } from '../anilist/hero';
import { refreshHomepage } from '../anilist/home';
import { refreshSimulcastSeasonStarts } from '../anilist/simulcast';
import { refreshPopularAnime } from '../browse';

export async function refreshCatalogSnapshots(now = new Date()) {
    const { season, year } = currentAnimeSeason(now);
    await refreshHomepage(season, year);
    await refreshPopularAnime();
    await getBrowseTaxonomy(true);
    await refreshSimulcastSeasonStarts();
    await refreshHomeHeroCandidates(now);
}
