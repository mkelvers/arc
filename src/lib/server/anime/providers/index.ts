import { env } from '$env/dynamic/private';

import { allanimeProvider } from './allanime';
import { anikotoProvider } from './anikoto';
import { aninekoProvider } from './anineko';
import { animepaheProvider } from './animepahe';
import { anipubProvider } from './anipub';
import { createProviderFallback } from './fallback';
import { senshiProvider } from './senshi';

const defaultProviders = [
    allanimeProvider,
    anikotoProvider,
    aninekoProvider,
    senshiProvider,
] as const;
const availableProviders = [...defaultProviders, anipubProvider, animepaheProvider] as const;
const providers = new Map(
    availableProviders.map((provider) => [provider.name.toLowerCase(), provider])
);

function providerOrder() {
    const configured = env.PLAYBACK_PROVIDERS?.split(',')
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
