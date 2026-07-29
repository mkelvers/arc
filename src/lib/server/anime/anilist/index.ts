import { getAnime } from './details';
import { getHomepage } from './home';
import { searchAnime } from './search';
import {
    getWatchlistTransferAnime,
    resolveWatchlistImport,
} from './transfer';
import { getWatchlistAnime } from './watchlist';

export const anilist = {
    getAnime,
    getHomepage,
    getWatchlistTransferAnime,
    getWatchlistAnime,
    resolveWatchlistImport,
    searchAnime,
};
