import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ url }) => ({
    canonical: new URL(url.pathname, url.origin).href,
});
