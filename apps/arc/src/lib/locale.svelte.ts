import { getLocale, setLocale } from '$lib/paraglide/runtime.js';

export type AppLocale = 'en' | 'ja' | 'es';
export const locale = $state({ current: getLocale() as AppLocale });

export function changeLocale(nextLocale: AppLocale) {
    setLocale(nextLocale, { reload: false });
    locale.current = nextLocale;
}
