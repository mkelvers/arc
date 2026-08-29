import type { StoredMapping } from './types';

export function mappingNeedsVerification(
    mapping: Pick<StoredMapping, 'title' | 'verifiedAt' | 'mappingRevision'>,
    title: string | null,
    now = Date.now()
) {
    // TMDB identities can be corrected upstream, so recheck persisted mappings monthly.
    return (
        mapping.title !== title ||
        mapping.mappingRevision !== 'tmdb-mapping-v9' ||
        !mapping.verifiedAt ||
        now - mapping.verifiedAt.getTime() >= 30 * 24 * 60 * 60 * 1_000
    );
}
