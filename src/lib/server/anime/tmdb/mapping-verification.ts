import type { StoredMapping } from './types';

// TMDB identities can be corrected upstream. Recheck them periodically without
// tying persisted data to an implementation version or writing on every read.
const verificationLifetime = 30 * 24 * 60 * 60 * 1_000;

export function mappingNeedsVerification(
  mapping: Pick<StoredMapping, 'title' | 'verifiedAt'>,
  title: string | null,
  now = Date.now()
) {
  return (
    mapping.title !== title ||
    !mapping.verifiedAt ||
    now - mapping.verifiedAt.getTime() >= verificationLifetime
  );
}
