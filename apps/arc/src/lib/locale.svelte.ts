import { getLocale, setLocale } from '$lib/paraglide/runtime.js';

export type AppLocale = 'en' | 'da' | 'de' | 'es' | 'ja';
export const locale = $state({ current: getLocale() as AppLocale });

export function changeLocale(nextLocale: AppLocale) {
    setLocale(nextLocale, { reload: false });
    locale.current = nextLocale;
}
