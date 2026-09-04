# Slice 4: TMDB metadata

## Objective

Reimplement the required TMDB artwork, title, episode, movie, mapping, and enrichment fundamentals in core with explicit ownership of external metadata and persisted mapping evidence.

## Behavior to understand

Inspect `packages/backend/src/anime/tmdb/` and the consumers in card/detail/catalog flows. Classify each module as required metadata behavior, playback/provider behavior, migration residue, or test-only support. Preserve mapping evidence and metadata provenance; do not silently replace catalog identity or playback inventory.

## Core design

- Put catalog-owned TMDB metadata under a deliberate core catalog or metadata boundary.
- Keep TMDB transport credentials and external calls server-side.
- Persist only the metadata and mapping facts the product needs.
- Keep mapping evidence beside the mapping operation, not in a generic utility layer.

## Consumers

Migrate API detail/card/catalog operations and scheduler enrichment/repair operations. Remove backend enrichment imports as each core operation is established.

## Remove after migration

Delete replaced backend TMDB modules, duplicate generated or transport glue, and obsolete wrappers. Preserve schema migrations and persisted mapping data.

## Focused checks

- Mapping evidence and verification tests.
- Artwork/title/episode selection tests.
- Persistence repair tests that prove existing data is not discarded.
- Provider and catalog ownership import checks.

## Exit criteria

Required TMDB metadata behavior has one core owner, provenance and mapping evidence remain intact, consumers use core, and replaced backend TMDB files are deleted.
