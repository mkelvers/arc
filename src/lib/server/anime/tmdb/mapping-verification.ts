import type { StoredMapping } from './types';

export function mappingNeedsVerification(
    mapping: Pick<StoredMapping, 'title' | 'verifiedAt'>,
    title: string | null,
    now = Date.now()
) {
    // TMDB identities can be corrected upstream, so recheck persisted mappings monthly.
    return (
        mapping.title !== title ||
        !mapping.verifiedAt ||
        now - mapping.verifiedAt.getTime() >= 30 * 24 * 60 * 60 * 1_000
    );
}
