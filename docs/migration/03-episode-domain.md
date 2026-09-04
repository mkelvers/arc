# Slice 3: episode domain and synchronization

## Objective

Move catalog-owned episode metadata, release reconciliation, and synchronization fundamentals into core while keeping playback/provider inventory as a separate concern.

## Behavior to understand

Inspect `packages/backend/src/anime/episodes.ts`, `episodes/`, AniList releases/airing behavior, and the existing core episode primitives. Separate catalog facts (episodes, release dates, titles, numbering) from provider availability and playback selection.

## Core design

- Keep episode domain rules under `packages/core/src/catalog/`.
- Make persistence ordering explicit and preserve existing records during reconciliation.
- Keep provider inventory out of catalog tables and catalog decisions.
- Use direct operations instead of thin policy or selection wrappers.

## Consumers

Migrate API episode/catalog routes and scheduler episode synchronization. Any playback consumer remains on its existing owner until the provider-playback slice.

## Remove after migration

Delete replaced backend episode model, route, synchronization, and duplicate policy files. Leave backend broken where later consumers still import the removed modules.

## Focused checks

- Episode reconciliation and numbering tests.
- Persistence ordering and non-destructive repair tests.
- Release-calendar integration tests at the core boundary.
- Import inventory separating catalog and playback dependencies.

## Exit criteria

Core owns the episode catalog fundamentals and synchronization behavior, catalog data is distinct from playback truth, and replaced backend episode files are deleted.
