import { allanimeProvider } from './allanime';
import { anikotoProvider } from './anikoto';
import { aninekoProvider } from './anineko';
import { animeggProvider } from './animegg';
import { aniDBAppProvider } from './anidb-app';
import { animeDunyaProvider } from './animedunya';
import { animeNoSubProvider } from './animenosub';
import { animepaheProvider } from './animepahe';
import { anipubProvider } from './anipub';
import { anizoneProvider } from './anizone';
import { createProviderFallback } from './fallback';
import { kickAssAnimeProvider } from './kickassanime';
import { reAnimeProvider } from './reanime';
import { senshiProvider } from './senshi';
import { twoDHiveProvider } from './two-d-hive';

export const playbackProviders = [
    allanimeProvider,
    anikotoProvider,
    aninekoProvider,
    animeggProvider,
    senshiProvider,
    anipubProvider,
    animepaheProvider,
    anizoneProvider,
    reAnimeProvider,
    aniDBAppProvider,
    twoDHiveProvider,
    animeDunyaProvider,
    animeNoSubProvider,
    kickAssAnimeProvider,
] as const;

export const playback = createProviderFallback(playbackProviders);
