import type { AnimeCard, AnimeCardPage, ContinueWatchingCard } from '../types';
import type { AnimeSearchResult } from '../search';
import type { BrowseFilters } from './browse-filters';
import type { BrowseCatalogEntry } from './browse-types';
import type { BrowseSourceTaxonomy } from './browse-transform';
import type { ReleaseCalendarEntry } from './release-calendar-parser';
import type { AnimeSeasonSelection } from '../season';

export type CatalogBrowseFilters = Omit<BrowseFilters, 'audio'>;

export interface HomeHero {
    id: number;
    href: string;
    link: string;
    episodeLabel: string;
    title: string;
    image: string;
    logo: {
        url: string;
        size: number;
    };
    audioLabel: string;
    genres: string[];
    description: string;
}

export interface CatalogSource {
    browsePage: (
        filters: CatalogBrowseFilters,
        page: number,
        perPage: number,
        forceRefresh: boolean
    ) => Promise<{
        anime: BrowseCatalogEntry[];
        hasNextPage: boolean;
    }>;
    browseTaxonomy: (forceRefresh: boolean) => Promise<BrowseSourceTaxonomy>;
    search: (query: string) => Promise<AnimeSearchResult[]>;
    releaseCalendar: (from: Date, to: Date) => Promise<ReleaseCalendarEntry[]>;
    simulcastPage: (selection: AnimeSeasonSelection, page: number) => Promise<AnimeCardPage>;
    loadHomeHero: (id: number) => Promise<HomeHero | null>;
    continueWatching: (userId: string) => Promise<ContinueWatchingCard[]>;
    enrichAnimeCards: <T extends AnimeCard>(cards: T[]) => Promise<T[]>;
    enrichSearchMetadata: <T extends AnimeSearchResult>(results: T[]) => Promise<T[]>;
}
