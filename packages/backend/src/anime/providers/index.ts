import { allanimeProvider } from './allanime';
import { anikotoProvider } from './anikoto';
import { aninekoProvider } from './anineko';
import { animeggProvider } from './animegg';
import { animepaheProvider } from './animepahe';
import { anipubProvider } from './anipub';
import { anizoneProvider } from './anizone';
import { createProviderFallback } from './fallback';
import { senshiProvider } from './senshi';

export const playbackProviders = [
    allanimeProvider,
    anikotoProvider,
    aninekoProvider,
    animeggProvider,
    senshiProvider,
    anipubProvider,
    animepaheProvider,
    anizoneProvider,
] as const;

export const playback = createProviderFallback(playbackProviders);
