import { allanimeProvider } from './allanime';
import { anikotoProvider } from './anikoto';
import { aninekoProvider } from './anineko';
import { animeggProvider } from './animegg';
import { animepaheProvider } from './animepahe';
import { anipubProvider } from './anipub';
import { anizoneProvider } from './anizone';
import { createProviderFallback } from './fallback';
import { senshiProvider } from './senshi';

const defaultProviders = [
    allanimeProvider,
    anikotoProvider,
    aninekoProvider,
    animeggProvider,
    senshiProvider,
    anipubProvider,
    animepaheProvider,
    anizoneProvider,
] as const;
const providers = new Map(
    defaultProviders.map((provider) => [provider.name.toLowerCase(), provider])
);

function providerOrder() {
    const configured = process.env.PLAYBACK_PROVIDERS?.split(',')
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean);
    if (!configured?.length) {
        return defaultProviders;
    }

    const selected = configured.map((name) => {
        const provider = providers.get(name);
        if (!provider) {
            throw new Error(
                `Unknown playback provider "${name}". Available providers: ${[
                    ...providers.keys(),
                ].join(', ')}`
            );
        }
        return provider;
    });

    return selected.filter((provider, index) => selected.indexOf(provider) === index);
}

export const playback = createProviderFallback(providerOrder());
